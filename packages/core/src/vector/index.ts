/**
 * Converts between SVG, Android VectorDrawable XML and Jetpack Compose ImageVector
 * Kotlin code, through one intermediate model.
 *
 * Supported: paths and basic shapes, groups with translate/scale/rotate (and
 * matrix() without skew), fill/stroke colours and opacity, stroke width/caps/
 * joins/miter, even-odd fill, viewBox offsets, presentation attributes and inline
 * style="". Not supported (reported as warnings): gradients, clip paths, masks,
 * <use>, text, images, CSS classes, skew transforms.
 */
import { parseColor, type Rgba } from '../units/index.ts';
import { formatPath, num, parsePath, PathError, shapeToPath } from './path.ts';
import { parseXml, XmlError, type XmlElement } from './xml.ts';

export { parsePath, formatPath } from './path.ts';

export interface Transform {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  pivotX: number;
  pivotY: number;
}

export interface VPath {
  type: 'path';
  d: string;
  fill: Rgba | null;
  fillAlpha: number;
  stroke: Rgba | null;
  strokeAlpha: number;
  strokeWidth: number;
  cap: 'butt' | 'round' | 'square';
  join: 'miter' | 'round' | 'bevel';
  miter: number;
  evenOdd: boolean;
}

export interface VGroup {
  type: 'group';
  transform: Transform;
  children: VNode[];
}

export type VNode = VPath | VGroup;

export interface VectorImage {
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  children: VNode[];
}

export interface ConvertResult {
  output: string;
  warnings: string[];
  image: VectorImage;
}

export class VectorError extends Error {}

const IDENTITY: Transform = { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, pivotX: 0, pivotY: 0 };
const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

// ---------------------------------------------------------------------------
// SVG → model

interface Style {
  fill: string;
  stroke: string;
  fillOpacity: number;
  strokeOpacity: number;
  opacity: number;
  strokeWidth: number;
  cap: VPath['cap'];
  join: VPath['join'];
  miter: number;
  fillRule: string;
}

const INHERITED: Style = { fill: '#000', stroke: 'none', fillOpacity: 1, strokeOpacity: 1, opacity: 1, strokeWidth: 1, cap: 'butt', join: 'miter', miter: 4, fillRule: 'nonzero' };

function styleOf(el: XmlElement, parent: Style, warn: (w: string) => void): Style {
  const props: Record<string, string> = { ...el.attrs };
  for (const decl of (el.attrs.style ?? '').split(';')) {
    const [k, v] = decl.split(':').map((s) => s?.trim());
    if (k && v) props[k] = v;
  }
  if (el.attrs.class) warn('CSS classes (class="…") are ignored; use presentation attributes or inline style.');
  const num = (v: string | undefined, d: number) => (v === undefined || v === '' || Number.isNaN(parseFloat(v)) ? d : parseFloat(v) / (v.trim().endsWith('%') ? 100 : 1));
  return {
    fill: props.fill ?? parent.fill,
    stroke: props.stroke ?? parent.stroke,
    fillOpacity: num(props['fill-opacity'], parent.fillOpacity),
    strokeOpacity: num(props['stroke-opacity'], parent.strokeOpacity),
    // opacity isn't inherited, it multiplies down the tree.
    opacity: parent.opacity * num(props.opacity, 1),
    strokeWidth: num(props['stroke-width'], parent.strokeWidth),
    cap: (props['stroke-linecap'] as Style['cap']) ?? parent.cap,
    join: (props['stroke-linejoin'] === 'miter-clip' || props['stroke-linejoin'] === 'arcs' ? 'miter' : (props['stroke-linejoin'] as Style['join'])) ?? parent.join,
    miter: num(props['stroke-miterlimit'], parent.miter),
    fillRule: props['fill-rule'] ?? parent.fillRule,
  };
}

function paint(value: string, warn: (w: string) => void): Rgba | null {
  const v = value.trim();
  if (v === 'none' || v === 'transparent') return null;
  if (v.startsWith('url(')) {
    warn('Gradients and patterns (url(#…)) aren’t converted; those shapes fall back to black. Recreate them with Brush.linearGradient or <gradient> by hand.');
    return BLACK;
  }
  if (v === 'currentColor') {
    warn('currentColor became black. Tint the icon instead (Icon(tint = …) or android:tint).');
    return BLACK;
  }
  try {
    return parseColor(v, 'rgba');
  } catch {
    warn(`Unknown colour "${v}" became black.`);
    return BLACK;
  }
}

/** Splits an SVG transform list into nested group transforms, outermost first. */
function parseTransform(t: string, warn: (w: string) => void): Transform[] {
  const out: Transform[] = [];
  for (const m of t.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const fn = m[1]!;
    const a = m[2]!.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    switch (fn) {
      case 'translate':
        out.push({ ...IDENTITY, translateX: a[0] ?? 0, translateY: a[1] ?? 0 });
        break;
      case 'scale':
        out.push({ ...IDENTITY, scaleX: a[0] ?? 1, scaleY: a[1] ?? a[0] ?? 1 });
        break;
      case 'rotate':
        out.push({ ...IDENTITY, rotation: a[0] ?? 0, pivotX: a[1] ?? 0, pivotY: a[2] ?? 0 });
        break;
      case 'matrix': {
        const [A = 1, B = 0, C = 0, D = 1, E = 0, F = 0] = a;
        // Decompose into translate · rotate · scale when there's no skew.
        const sx = Math.hypot(A, B);
        const sy = (A * D - B * C) / (sx || 1);
        const skew = Math.abs(A * C + B * D) > 1e-6 * Math.max(1, sx * sx);
        if (skew) {
          warn('A skewed matrix() transform was ignored; skew isn’t supported by VectorDrawable or ImageVector.');
          break;
        }
        out.push({ ...IDENTITY, translateX: E, translateY: F });
        const rotation = (Math.atan2(B, A) * 180) / Math.PI;
        if (Math.abs(rotation) > 1e-9) out.push({ ...IDENTITY, rotation });
        if (Math.abs(sx - 1) > 1e-9 || Math.abs(sy - 1) > 1e-9) out.push({ ...IDENTITY, scaleX: sx, scaleY: sy });
        break;
      }
      default:
        warn(`${fn}() transforms aren’t supported and were ignored.`);
    }
  }
  return out;
}

function wrap(children: VNode[], transforms: Transform[]): VNode[] {
  return transforms.reduceRight<VNode[]>((inner, t) => [{ type: 'group', transform: t, children: inner }], children);
}

function length(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const m = v.trim().match(/^([\d.]+)\s*(px|dp|pt)?$/);
  if (!m) return undefined;
  return parseFloat(m[1]!) * (m[2] === 'pt' ? 4 / 3 : 1);
}

export function svgToImage(svgText: string): { image: VectorImage; warnings: string[] } {
  const warnings = new Set<string>();
  const warn = (w: string) => warnings.add(w);
  let root: XmlElement;
  try {
    root = parseXml(svgText);
  } catch (e) {
    throw new VectorError(`Couldn't read the SVG: ${(e as Error).message}`);
  }
  if (root.name !== 'svg' && !root.name.endsWith(':svg')) throw new VectorError('The root element must be <svg>.');

  const vb = root.attrs.viewBox?.trim().split(/[\s,]+/).map(Number);
  const w = length(root.attrs.width) ?? vb?.[2] ?? 24;
  const h = length(root.attrs.height) ?? vb?.[3] ?? 24;
  const [minX, minY, vw, vh] = vb && vb.length === 4 ? vb : [0, 0, w, h];

  const walk = (el: XmlElement, parent: Style): VNode[] => {
    const tag = el.name.replace(/^svg:/, '');
    if (['defs', 'title', 'desc', 'metadata', 'style', 'symbol', 'linearGradient', 'radialGradient', 'filter', 'pattern'].includes(tag)) {
      if (tag === 'style') warn('<style> blocks are ignored; use presentation attributes or inline style.');
      return [];
    }
    if (['text', 'image', 'use', 'foreignObject', 'switch'].includes(tag)) {
      warn(`<${tag}> isn’t supported and was skipped.${tag === 'text' ? ' Convert text to paths in your editor first.' : ''}`);
      return [];
    }
    if (el.attrs['clip-path'] || el.attrs.mask) warn('Clip paths and masks are ignored.');
    if (el.attrs.display === 'none' || el.attrs.visibility === 'hidden') return [];
    const style = styleOf(el, parent, warn);
    const transforms = el.attrs.transform ? parseTransform(el.attrs.transform, warn) : [];

    if (tag === 'g' || tag === 'svg' || tag === 'a') {
      const kids = el.children.flatMap((c) => walk(c, style));
      return kids.length ? wrap(kids, transforms) : [];
    }
    const d = shapeToPath(tag, el.attrs);
    if (d === null) {
      warn(`<${tag}> isn’t supported and was skipped.`);
      return [];
    }
    if (!d.trim()) return [];
    try {
      parsePath(d);
    } catch (e) {
      warn(`Skipped a <${tag}> with invalid path data: ${(e as Error).message}`);
      return [];
    }
    const fill = paint(style.fill, warn);
    const stroke = paint(style.stroke, warn);
    if (!fill && !stroke) return [];
    const path: VPath = {
      type: 'path',
      d: formatPath(parsePath(d)),
      fill,
      fillAlpha: (fill?.a ?? 1) * style.fillOpacity * style.opacity,
      stroke,
      strokeAlpha: (stroke?.a ?? 1) * style.strokeOpacity * style.opacity,
      strokeWidth: stroke ? style.strokeWidth : 0,
      cap: style.cap,
      join: style.join,
      miter: style.miter,
      evenOdd: style.fillRule === 'evenodd',
    };
    if (fill) path.fill = { ...fill, a: 1 };
    if (stroke) path.stroke = { ...stroke, a: 1 };
    return wrap([path], transforms);
  };

  let children = root.children.flatMap((c) => walk(c, styleOf(root, INHERITED, warn)));
  if (minX || minY) children = wrap(children, [{ ...IDENTITY, translateX: -minX!, translateY: -minY! }]);
  return { image: { width: w, height: h, viewportWidth: vw!, viewportHeight: vh!, children }, warnings: [...warnings] };
}

// ---------------------------------------------------------------------------
// VectorDrawable → model

function vdNumber(v: string | undefined, d: number): number {
  if (v === undefined) return d;
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : d;
}

export function vectorDrawableToImage(xml: string): { image: VectorImage; warnings: string[] } {
  const warnings = new Set<string>();
  const warn = (w: string) => warnings.add(w);
  let root: XmlElement;
  try {
    root = parseXml(xml);
  } catch (e) {
    throw new VectorError(`Couldn't read the XML: ${(e as Error).message}`);
  }
  if (root.name !== 'vector') throw new VectorError('The root element must be <vector>.');
  const A = (el: XmlElement, k: string) => el.attrs[`android:${k}`];
  const color = (v: string | undefined): Rgba | null => {
    if (!v) return null;
    if (v.startsWith('@') || v.startsWith('?')) {
      warn(`Resource colour ${v} became black; replace it with the real colour.`);
      return BLACK;
    }
    try {
      return parseColor(v, 'argb');
    } catch {
      warn(`Unknown colour "${v}" became black.`);
      return BLACK;
    }
  };
  if (A(root, 'tint')) warn('android:tint on <vector> isn’t carried over; apply the tint where the icon is used.');

  const walk = (el: XmlElement): VNode[] => {
    if (el.name === 'group') {
      return [
        {
          type: 'group',
          transform: {
            translateX: vdNumber(A(el, 'translateX'), 0),
            translateY: vdNumber(A(el, 'translateY'), 0),
            scaleX: vdNumber(A(el, 'scaleX'), 1),
            scaleY: vdNumber(A(el, 'scaleY'), 1),
            rotation: vdNumber(A(el, 'rotation'), 0),
            pivotX: vdNumber(A(el, 'pivotX'), 0),
            pivotY: vdNumber(A(el, 'pivotY'), 0),
          },
          children: el.children.flatMap(walk),
        },
      ];
    }
    if (el.name === 'clip-path') {
      warn('<clip-path> is ignored.');
      return [];
    }
    if (el.name !== 'path') {
      if (el.name.startsWith('aapt:')) warn('Gradients (aapt:attr) aren’t converted; those paths use black.');
      return [];
    }
    const d = A(el, 'pathData');
    if (!d) return [];
    try {
      parsePath(d);
    } catch (e) {
      throw new VectorError(`Invalid android:pathData: ${(e as Error).message}`);
    }
    const fill = color(A(el, 'fillColor'));
    const stroke = color(A(el, 'strokeColor'));
    if (el.children.some((c) => c.name.startsWith('aapt:'))) warn('Gradients (aapt:attr) aren’t converted; those paths use black.');
    return [
      {
        type: 'path',
        d: formatPath(parsePath(d)),
        fill: fill && { ...fill, a: 1 },
        fillAlpha: (fill?.a ?? 1) * vdNumber(A(el, 'fillAlpha'), 1),
        stroke: stroke && { ...stroke, a: 1 },
        strokeAlpha: (stroke?.a ?? 1) * vdNumber(A(el, 'strokeAlpha'), 1),
        strokeWidth: vdNumber(A(el, 'strokeWidth'), 0),
        cap: (A(el, 'strokeLineCap') as VPath['cap']) ?? 'butt',
        join: (A(el, 'strokeLineJoin') as VPath['join']) ?? 'miter',
        miter: vdNumber(A(el, 'strokeMiterLimit'), 4),
        evenOdd: A(el, 'fillType') === 'evenOdd',
      },
    ];
  };

  const dp = (v: string | undefined) => vdNumber(v?.replace(/dp$/, ''), 24);
  return {
    image: {
      width: dp(A(root, 'width')),
      height: dp(A(root, 'height')),
      viewportWidth: vdNumber(A(root, 'viewportWidth'), 24),
      viewportHeight: vdNumber(A(root, 'viewportHeight'), 24),
      children: root.children.flatMap(walk),
    },
    warnings: [...warnings],
  };
}

// ---------------------------------------------------------------------------
// Model → outputs

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
const argb = (c: Rgba, alpha = 1) => `${hex2(alpha * 255)}${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
const rgbHex = (c: Rgba) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;

export function toVectorDrawable(img: VectorImage): string {
  const lines = [
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
    `    android:width="${num(img.width)}dp"`,
    `    android:height="${num(img.height)}dp"`,
    `    android:viewportWidth="${num(img.viewportWidth)}"`,
    `    android:viewportHeight="${num(img.viewportHeight)}">`,
  ];
  const emit = (nodes: VNode[], indent: string) => {
    for (const node of nodes) {
      if (node.type === 'group') {
        const t = node.transform;
        const attrs = [
          t.rotation && `android:rotation="${num(t.rotation)}"`,
          t.pivotX && `android:pivotX="${num(t.pivotX)}"`,
          t.pivotY && `android:pivotY="${num(t.pivotY)}"`,
          t.scaleX !== 1 && `android:scaleX="${num(t.scaleX)}"`,
          t.scaleY !== 1 && `android:scaleY="${num(t.scaleY)}"`,
          t.translateX && `android:translateX="${num(t.translateX)}"`,
          t.translateY && `android:translateY="${num(t.translateY)}"`,
        ].filter(Boolean);
        lines.push(`${indent}<group${attrs.length ? `\n${indent}    ${attrs.join(`\n${indent}    `)}` : ''}>`);
        emit(node.children, `${indent}    `);
        lines.push(`${indent}</group>`);
        continue;
      }
      const p = node;
      const attrs = [
        p.fill && `android:fillColor="#${argb(p.fill)}"`,
        p.fill && p.fillAlpha < 1 && `android:fillAlpha="${num(p.fillAlpha)}"`,
        p.stroke && `android:strokeColor="#${argb(p.stroke)}"`,
        p.stroke && p.strokeAlpha < 1 && `android:strokeAlpha="${num(p.strokeAlpha)}"`,
        p.stroke && `android:strokeWidth="${num(p.strokeWidth)}"`,
        p.stroke && p.cap !== 'butt' && `android:strokeLineCap="${p.cap}"`,
        p.stroke && p.join !== 'miter' && `android:strokeLineJoin="${p.join}"`,
        p.stroke && p.join === 'miter' && p.miter !== 4 && `android:strokeMiterLimit="${num(p.miter)}"`,
        p.evenOdd && 'android:fillType="evenOdd"',
        `android:pathData="${p.d}"`,
      ].filter(Boolean);
      lines.push(`${indent}<path\n${indent}    ${attrs.join(`\n${indent}    `)} />`);
    }
  };
  emit(img.children, '    ');
  lines.push('</vector>');
  return `${lines.join('\n')}\n`;
}

export function toSvg(img: VectorImage): string {
  const lines = [`<svg xmlns="http://www.w3.org/2000/svg" width="${num(img.width)}" height="${num(img.height)}" viewBox="0 0 ${num(img.viewportWidth)} ${num(img.viewportHeight)}">`];
  const emit = (nodes: VNode[], indent: string) => {
    for (const node of nodes) {
      if (node.type === 'group') {
        const t = node.transform;
        // VectorDrawable order: translate(t + pivot) · rotate · scale · translate(−pivot)
        const parts = [
          (t.translateX + t.pivotX || t.translateY + t.pivotY) && `translate(${num(t.translateX + t.pivotX)} ${num(t.translateY + t.pivotY)})`,
          t.rotation && `rotate(${num(t.rotation)})`,
          (t.scaleX !== 1 || t.scaleY !== 1) && `scale(${num(t.scaleX)} ${num(t.scaleY)})`,
          (t.pivotX || t.pivotY) && `translate(${num(-t.pivotX)} ${num(-t.pivotY)})`,
        ].filter(Boolean);
        lines.push(`${indent}<g${parts.length ? ` transform="${parts.join(' ')}"` : ''}>`);
        emit(node.children, `${indent}  `);
        lines.push(`${indent}</g>`);
        continue;
      }
      const p = node;
      const attrs = [
        `d="${p.d}"`,
        `fill="${p.fill ? rgbHex(p.fill) : 'none'}"`,
        p.fill && p.fillAlpha < 1 && `fill-opacity="${num(p.fillAlpha)}"`,
        p.evenOdd && 'fill-rule="evenodd"',
        p.stroke && `stroke="${rgbHex(p.stroke)}"`,
        p.stroke && p.strokeAlpha < 1 && `stroke-opacity="${num(p.strokeAlpha)}"`,
        p.stroke && `stroke-width="${num(p.strokeWidth)}"`,
        p.stroke && p.cap !== 'butt' && `stroke-linecap="${p.cap}"`,
        p.stroke && p.join !== 'miter' && `stroke-linejoin="${p.join}"`,
        p.stroke && p.miter !== 4 && `stroke-miterlimit="${num(p.miter)}"`,
      ].filter(Boolean);
      lines.push(`${indent}<path ${attrs.join(' ')}/>`);
    }
  };
  emit(img.children, '  ');
  lines.push('</svg>');
  return `${lines.join('\n')}\n`;
}

const f = (n: number) => `${num(n)}f`;

const KT_COMMANDS: Record<string, string> = {
  M: 'moveTo', m: 'moveToRelative', L: 'lineTo', l: 'lineToRelative', H: 'horizontalLineTo', h: 'horizontalLineToRelative',
  V: 'verticalLineTo', v: 'verticalLineToRelative', C: 'curveTo', c: 'curveToRelative', S: 'reflectiveCurveTo', s: 'reflectiveCurveToRelative',
  Q: 'quadTo', q: 'quadToRelative', T: 'reflectiveQuadTo', t: 'reflectiveQuadToRelative', A: 'arcTo', a: 'arcToRelative', Z: 'close', z: 'close',
};

export interface ImageVectorOptions {
  name: string;
  /** Material-icons style cached property, or a plain val. */
  style: 'cached' | 'val';
  packageName: string;
}

export function toImageVector(img: VectorImage, o: ImageVectorOptions): string {
  const name = o.name.replace(/[^A-Za-z0-9_]/g, '') || 'Icon';
  const backing = `_${name[0]!.toLowerCase()}${name.slice(1)}`;
  const imports = new Set(['androidx.compose.ui.graphics.vector.ImageVector', 'androidx.compose.ui.unit.dp']);
  const body: string[] = [];

  const emit = (nodes: VNode[], indent: string) => {
    for (const node of nodes) {
      if (node.type === 'group') {
        imports.add('androidx.compose.ui.graphics.vector.group');
        const t = node.transform;
        const args = [
          t.rotation && `rotate = ${f(t.rotation)}`,
          t.pivotX && `pivotX = ${f(t.pivotX)}`,
          t.pivotY && `pivotY = ${f(t.pivotY)}`,
          t.scaleX !== 1 && `scaleX = ${f(t.scaleX)}`,
          t.scaleY !== 1 && `scaleY = ${f(t.scaleY)}`,
          t.translateX && `translationX = ${f(t.translateX)}`,
          t.translateY && `translationY = ${f(t.translateY)}`,
        ].filter(Boolean);
        body.push(`${indent}group(${args.join(', ')}) {`);
        emit(node.children, `${indent}    `);
        body.push(`${indent}}`);
        continue;
      }
      imports.add('androidx.compose.ui.graphics.vector.path');
      const p = node;
      const args: string[] = [];
      if (p.fill) {
        imports.add('androidx.compose.ui.graphics.Color');
        imports.add('androidx.compose.ui.graphics.SolidColor');
        args.push(`fill = SolidColor(Color(0x${argb(p.fill)}))`);
        if (p.fillAlpha < 1) args.push(`fillAlpha = ${f(p.fillAlpha)}`);
      }
      if (p.stroke) {
        imports.add('androidx.compose.ui.graphics.Color');
        imports.add('androidx.compose.ui.graphics.SolidColor');
        args.push(`stroke = SolidColor(Color(0x${argb(p.stroke)}))`);
        if (p.strokeAlpha < 1) args.push(`strokeAlpha = ${f(p.strokeAlpha)}`);
        args.push(`strokeLineWidth = ${f(p.strokeWidth)}`);
        if (p.cap !== 'butt') {
          imports.add('androidx.compose.ui.graphics.StrokeCap');
          args.push(`strokeLineCap = StrokeCap.${p.cap[0]!.toUpperCase()}${p.cap.slice(1)}`);
        }
        if (p.join !== 'miter') {
          imports.add('androidx.compose.ui.graphics.StrokeJoin');
          args.push(`strokeLineJoin = StrokeJoin.${p.join[0]!.toUpperCase()}${p.join.slice(1)}`);
        }
        if (p.miter !== 4) args.push(`strokeLineMiter = ${f(p.miter)}`);
      }
      if (p.evenOdd) {
        imports.add('androidx.compose.ui.graphics.PathFillType');
        args.push('pathFillType = PathFillType.EvenOdd');
      }
      body.push(`${indent}path(${args.length > 2 ? `\n${indent}    ${args.join(`,\n${indent}    `)},\n${indent}` : args.join(', ')}) {`);
      for (const c of parsePath(p.d)) {
        const fn = KT_COMMANDS[c.cmd]!;
        const vals = c.cmd.toLowerCase() === 'a' ? [f(c.args[0]!), f(c.args[1]!), f(c.args[2]!), String(c.args[3] !== 0), String(c.args[4] !== 0), f(c.args[5]!), f(c.args[6]!)] : c.args.map(f);
        body.push(`${indent}    ${fn}(${vals.join(', ')})`);
      }
      body.push(`${indent}}`);
    }
  };
  emit(img.children, o.style === 'cached' ? '            ' : '        ');

  const builder = (indent: string) =>
    [
      `ImageVector.Builder(`,
      `${indent}    name = "${name}",`,
      `${indent}    defaultWidth = ${num(img.width)}.dp,`,
      `${indent}    defaultHeight = ${num(img.height)}.dp,`,
      `${indent}    viewportWidth = ${f(img.viewportWidth)},`,
      `${indent}    viewportHeight = ${f(img.viewportHeight)},`,
      `${indent}).apply {`,
      ...body,
      `${indent}}.build()`,
    ].join('\n');

  const head = [o.packageName.trim() && `package ${o.packageName.trim()}\n`, [...imports].sort().map((i) => `import ${i}`).join('\n')].filter(Boolean).join('\n');
  const code =
    o.style === 'cached'
      ? `val ${name}: ImageVector\n    get() {\n        if (${backing} != null) return ${backing}!!\n        ${backing} = ${builder('        ')}\n        return ${backing}!!\n    }\n\nprivate var ${backing}: ImageVector? = null`
      : `val ${name}: ImageVector = ${builder('')}`;
  return `${head}\n\n${code}\n`;
}

// ---------------------------------------------------------------------------
// Entry points

export type VectorFormat = 'svg' | 'vector-drawable' | 'image-vector';

export function detectFormat(text: string): 'svg' | 'vector-drawable' | null {
  if (/<svg[\s/>]/i.test(text)) return 'svg';
  if (/<vector[\s/>]/.test(text)) return 'vector-drawable';
  return null;
}

export function convertVector(input: string, to: VectorFormat, options: Partial<ImageVectorOptions> = {}): ConvertResult {
  const from = detectFormat(input);
  if (!from) throw new VectorError('Paste an SVG (<svg …>) or a VectorDrawable (<vector …>).');
  let parsed: { image: VectorImage; warnings: string[] };
  try {
    parsed = from === 'svg' ? svgToImage(input) : vectorDrawableToImage(input);
  } catch (e) {
    if (e instanceof XmlError || e instanceof PathError) throw new VectorError(e.message);
    throw e;
  }
  if (!parsed.image.children.length) parsed.warnings.push('Nothing drawable was found.');
  const output =
    to === 'svg'
      ? toSvg(parsed.image)
      : to === 'vector-drawable'
        ? toVectorDrawable(parsed.image)
        : toImageVector(parsed.image, { name: options.name ?? 'MyIcon', style: options.style ?? 'cached', packageName: options.packageName ?? '' });
  return { output, warnings: parsed.warnings, image: parsed.image };
}
