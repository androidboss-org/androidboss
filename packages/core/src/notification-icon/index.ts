/**
 * Notification (status bar) icons. Android draws the small icon from its alpha
 * channel only and tints it, so the icon must be a white silhouette on a
 * transparent background: 24dp, with art kept inside the padding.
 *
 * Works on raw RGBA pixels so it runs the same in the browser and in Node; the
 * page draws the source (image, SVG, letter or emoji) onto a canvas first.
 */
import { DENSITIES, DENSITY_SCALE, type Density } from '../app-icon/index.ts';
import type { VectorImage, VNode } from '../vector/index.ts';

export const ICON_DP = 24;
/** Material system icons keep art inside a 20dp live area. */
export const DEFAULT_PADDING_DP = 2;

export type MaskSource = 'alpha' | 'dark' | 'light';

export interface Mask {
  width: number;
  height: number;
  /** 0–1 coverage per pixel. */
  data: Float32Array;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Turn an image into a coverage mask. 'alpha' uses transparency; for opaque
 * images, 'dark' treats dark pixels as the shape and 'light' light ones.
 */
export function toMask(rgba: ArrayLike<number>, width: number, height: number, source: MaskSource = 'alpha', threshold = 0.5): Mask {
  const data = new Float32Array(width * height);
  const soft = 0.08;
  for (let i = 0; i < width * height; i++) {
    const a = rgba[i * 4 + 3]! / 255;
    if (source === 'alpha') {
      data[i] = a;
      continue;
    }
    const l = (0.2126 * rgba[i * 4]! + 0.7152 * rgba[i * 4 + 1]! + 0.0722 * rgba[i * 4 + 2]!) / 255;
    const t = source === 'dark' ? (threshold - l) / soft + 0.5 : (l - threshold) / soft + 0.5;
    data[i] = Math.min(1, Math.max(0, t)) * a;
  }
  return { width, height, data };
}

/** Smallest box holding every pixel with visible coverage. */
export function maskBounds(m: Mask, min = 0.02): Bounds | null {
  let x0 = m.width;
  let y0 = m.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < m.width; x++)
      if (m.data[y * m.width + x]! > min) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

export interface MaskReport {
  empty: boolean;
  /** Share of the bounding box that is solid. */
  fill: number;
  /** Share of the source image the shape spans. */
  span: number;
  warnings: string[];
}

export function analyzeMask(m: Mask): MaskReport {
  const b = maskBounds(m);
  if (!b) return { empty: true, fill: 0, span: 0, warnings: ['Nothing to draw: the image is fully transparent with these settings.'] };
  let sum = 0;
  let partial = 0;
  for (let y = b.y; y < b.y + b.height; y++)
    for (let x = b.x; x < b.x + b.width; x++) {
      const v = m.data[y * m.width + x]!;
      sum += v;
      if (v > 0.1 && v < 0.9) partial++;
    }
  const area = b.width * b.height;
  const fill = sum / area;
  const span = Math.max(b.width / m.width, b.height / m.height);
  const warnings: string[] = [];
  if (fill > 0.92) warnings.push('The shape is an almost solid block. Android will show it as a plain white square or circle. Use a logo with transparent background, or pick "dark shapes" or "light shapes".');
  if (partial / area > 0.3) warnings.push('Much of the shape is semi-transparent, so it will look faint. Notification icons should be solid.');
  if (fill < 0.06) warnings.push('The shape is very thin and may disappear at 24dp. Use a bolder mark.');
  return { empty: false, fill, span, warnings };
}

/** Fit the mask's content into a size×size square with padding, by area averaging. */
export function fitMask(m: Mask, size: number, paddingPx: number): Mask {
  const out = new Float32Array(size * size);
  const b = maskBounds(m);
  if (!b) return { width: size, height: size, data: out };
  const box = size - 2 * paddingPx;
  const scale = box / Math.max(b.width, b.height);
  const offX = paddingPx + (box - b.width * scale) / 2;
  const offY = paddingPx + (box - b.height * scale) / 2;
  // Each output pixel averages the source area it covers.
  for (let oy = 0; oy < size; oy++)
    for (let ox = 0; ox < size; ox++) {
      const sx0 = (ox - offX) / scale + b.x;
      const sx1 = (ox + 1 - offX) / scale + b.x;
      const sy0 = (oy - offY) / scale + b.y;
      const sy1 = (oy + 1 - offY) / scale + b.y;
      let acc = 0;
      let wsum = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++)
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          const w = (Math.min(sx + 1, sx1) - Math.max(sx, sx0)) * (Math.min(sy + 1, sy1) - Math.max(sy, sy0));
          if (w <= 0) continue;
          wsum += w;
          if (sx >= 0 && sy >= 0 && sx < m.width && sy < m.height) acc += m.data[sy * m.width + sx]! * w;
        }
      out[oy * size + ox] = wsum ? acc / wsum : 0;
    }
  return { width: size, height: size, data: out };
}

/** White pixels with the mask as alpha. */
export function whiteRgba(m: Mask): Uint8ClampedArray<ArrayBuffer> {
  const px = new Uint8ClampedArray(m.width * m.height * 4);
  for (let i = 0; i < m.width * m.height; i++) {
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = 255;
    px[i * 4 + 3] = Math.round(m.data[i]! * 255);
  }
  return px;
}

export interface IconSize {
  density: Density;
  size: number;
  path: string;
}

export function iconSizes(name: string): IconSize[] {
  return DENSITIES.map((d) => ({ density: d, size: Math.round(ICON_DP * DENSITY_SCALE[d]), path: `res/drawable-${d}/${name}.png` }));
}

export function isValidIconName(name: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(name);
}

// ---------------------------------------------------------------------------
// Vector (from SVG input)

function whiten(nodes: VNode[]): VNode[] {
  return nodes.map((n) =>
    n.type === 'group'
      ? { ...n, children: whiten(n.children) }
      : { ...n, fill: n.fill && n.fill.a > 0 ? { r: 255, g: 255, b: 255, a: n.fill.a } : n.fill, stroke: n.stroke && n.stroke.a > 0 ? { r: 255, g: 255, b: 255, a: n.stroke.a } : n.stroke },
  );
}

/**
 * A 24dp white VectorDrawable from a parsed SVG. `bounds` is the content box in
 * the SVG's viewport units (from rendering it), so the art can be fitted inside
 * the padding like the PNGs.
 */
export function vectorIcon(img: VectorImage, bounds: Bounds, paddingDp = DEFAULT_PADDING_DP): VectorImage {
  const box = ICON_DP - 2 * paddingDp;
  const scale = box / Math.max(bounds.width, bounds.height);
  return {
    width: ICON_DP,
    height: ICON_DP,
    viewportWidth: ICON_DP,
    viewportHeight: ICON_DP,
    children: [
      {
        type: 'group',
        transform: {
          translateX: paddingDp + (box - bounds.width * scale) / 2 - bounds.x * scale,
          translateY: paddingDp + (box - bounds.height * scale) / 2 - bounds.y * scale,
          scaleX: scale,
          scaleY: scale,
          rotation: 0,
          pivotX: 0,
          pivotY: 0,
        },
        children: whiten(img.children),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Code

export function snippets(name: string, color: string): { manifest: string; kotlin: string } {
  const c = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1).toUpperCase() : '0F8A4A';
  return {
    manifest: `<!-- Firebase Cloud Messaging: icon and colour for notifications it shows while the app is in the background -->
<meta-data
    android:name="com.google.firebase.messaging.default_notification_icon"
    android:resource="@drawable/${name}" />
<meta-data
    android:name="com.google.firebase.messaging.default_notification_color"
    android:resource="@color/notification_accent" />`,
    kotlin: `val notification = NotificationCompat.Builder(context, CHANNEL_ID)
    .setSmallIcon(R.drawable.${name})
    // Tints the icon and app name in the notification header.
    .setColor(0xFF${c}.toInt())
    .setContentTitle(title)
    .setContentText(text)
    .build()`,
  };
}
