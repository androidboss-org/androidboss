/**
 * Android density units and colour formats.
 *
 * px = dp × (dpi / 160). sp scales like dp times the user's font scale; note that
 * Android 14+ scales large text non-linearly, so sp → px here is the linear
 * (pre-14, or small text) value.
 */

export interface DensityBucket {
  id: string;
  dpi: number;
}

export const densities: readonly DensityBucket[] = [
  { id: 'ldpi', dpi: 120 },
  { id: 'mdpi', dpi: 160 },
  { id: 'tvdpi', dpi: 213 },
  { id: 'hdpi', dpi: 240 },
  { id: 'xhdpi', dpi: 320 },
  { id: 'xxhdpi', dpi: 480 },
  { id: 'xxxhdpi', dpi: 640 },
];

export type Unit = 'dp' | 'sp' | 'px';

/** Converts a value to px at the given dpi and font scale. */
export function toPx(value: number, unit: Unit, dpi: number, fontScale = 1): number {
  if (unit === 'px') return value;
  const dp = unit === 'sp' ? value * fontScale : value;
  return (dp * dpi) / 160;
}

export function fromPx(px: number, unit: Unit, dpi: number, fontScale = 1): number {
  if (unit === 'px') return px;
  const dp = (px * 160) / dpi;
  return unit === 'sp' ? dp / fontScale : dp;
}

/** Rounds for display: up to 2 decimals, no trailing zeros. */
export function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

// ---------------------------------------------------------------------------
// Colour

export interface Rgba {
  r: number; // 0–255
  g: number;
  b: number;
  a: number; // 0–1
}

export type HexOrder = 'argb' | 'rgba';

export class ColorParseError extends Error {}

const NAMED: Record<string, string> = {
  black: '000000', white: 'ffffff', red: 'ff0000', green: '008000', blue: '0000ff', yellow: 'ffff00',
  cyan: '00ffff', magenta: 'ff00ff', gray: '808080', grey: '808080', transparent: '00000000',
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/**
 * Parses #RGB, #RRGGBB, 8-digit hex (#AARRGGBB on Android or #RRGGBBAA in CSS,
 * chosen by `order`), 0xAARRGGBB, Color(0xAARRGGBB), rgb()/rgba(), hsl()/hsla()
 * and a few colour names.
 */
export function parseColor(input: string, order: HexOrder = 'argb'): Rgba {
  let s = input.trim().toLowerCase();
  if (NAMED[s]) s = `#${NAMED[s]}`;
  const kotlin = s.match(/^color\(\s*(0x[0-9a-f_]+)\s*\)$/);
  if (kotlin) s = kotlin[1]!.replace(/_/g, '');

  const hex = s.match(/^(?:#|0x)([0-9a-f]+)$/);
  if (hex) {
    let h = hex[1]!;
    const fromOx = s.startsWith('0x');
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length === 6) h = (fromOx || order === 'argb' ? 'ff' : '') + h + (fromOx || order === 'argb' ? '' : 'ff');
    if (h.length !== 8) throw new ColorParseError('Hex colours need 3, 4, 6 or 8 digits.');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    // 0x… is always ARGB (Kotlin/Java int); # follows the chosen order.
    return fromOx || order === 'argb' ? { a: n(0) / 255, r: n(2), g: n(4), b: n(6) } : { r: n(0), g: n(2), b: n(4), a: n(6) / 255 };
  }

  const fn = s.match(/^(rgba?|hsla?)\(([^)]*)\)$/);
  if (fn) {
    const parts = fn[2]!.split(/[\s,/]+/).filter(Boolean);
    const num = (p: string, max: number) => (p.endsWith('%') ? (parseFloat(p) / 100) * max : parseFloat(p));
    if (parts.length < 3 || parts.length > 4 || parts.some((p) => Number.isNaN(parseFloat(p)))) throw new ColorParseError(`Couldn't read ${fn[1]}().`);
    const alpha = parts[3] === undefined ? 1 : clamp(num(parts[3], 1), 0, 1);
    if (fn[1]!.startsWith('rgb')) return { r: clamp(num(parts[0]!, 255), 0, 255), g: clamp(num(parts[1]!, 255), 0, 255), b: clamp(num(parts[2]!, 255), 0, 255), a: alpha };
    const [r, g, b] = hsl(((parseFloat(parts[0]!) % 360) + 360) % 360, clamp(num(parts[1]!, 1), 0, 1), clamp(num(parts[2]!, 1), 0, 1));
    return { r, g, b, a: alpha };
  }
  throw new ColorParseError('Use hex (#RRGGBB, #AARRGGBB), 0xAARRGGBB, rgb(), hsl() or a colour name.');
}

const h2 = (n: number) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
const f3 = (n: number) => `${Math.round(n * 1000) / 1000}`;

function toHsl({ r, g, b }: Rgba): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

/** Every format a developer might paste into Android, Compose, the web or iOS. */
export function colorFormats(c: Rgba): { label: string; value: string }[] {
  const A = h2(c.a * 255);
  const rgb = `${h2(c.r)}${h2(c.g)}${h2(c.b)}`;
  const argbInt = ((Math.round(c.a * 255) << 24) | (Math.round(c.r) << 16) | (Math.round(c.g) << 8) | Math.round(c.b)) | 0;
  const [hh, ss, ll] = toHsl(c);
  const opaque = A === 'FF';
  const alphaCss = Math.round(c.a * 1000) / 1000;
  return [
    { label: 'Android XML (#AARRGGBB)', value: `#${A}${rgb}` },
    ...(opaque ? [{ label: 'Android XML (#RRGGBB)', value: `#${rgb}` }] : []),
    { label: 'Jetpack Compose', value: `Color(0x${A}${rgb})` },
    { label: 'Compose (floats)', value: `Color(red = ${f3(c.r / 255)}f, green = ${f3(c.g / 255)}f, blue = ${f3(c.b / 255)}f, alpha = ${f3(c.a)}f)` },
    { label: 'Android color int', value: String(argbInt) },
    { label: 'CSS hex', value: opaque ? `#${rgb}` : `#${rgb}${A}` },
    { label: 'CSS rgb()', value: opaque ? `rgb(${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)})` : `rgb(${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)} / ${alphaCss})` },
    { label: 'CSS hsl()', value: `hsl(${Math.round(hh)} ${Math.round(ss * 100)}% ${Math.round(ll * 100)}%${opaque ? '' : ` / ${alphaCss}`})` },
    { label: 'SwiftUI', value: `Color(red: ${f3(c.r / 255)}, green: ${f3(c.g / 255)}, blue: ${f3(c.b / 255)}, opacity: ${f3(c.a)})` },
    { label: 'UIKit', value: `UIColor(red: ${f3(c.r / 255)}, green: ${f3(c.g / 255)}, blue: ${f3(c.b / 255)}, alpha: ${f3(c.a)})` },
  ];
}

/** Opacity % → the hex alpha byte Android expects in front (e.g. 50% → 80). */
export function alphaHex(percent: number): string {
  return h2((clamp(percent, 0, 100) / 100) * 255);
}
