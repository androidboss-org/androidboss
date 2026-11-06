/**
 * Android and iOS app icon specification: which bitmaps to render and the XML/JSON
 * that ties them together. Rendering pixels is left to the caller (canvas in the
 * browser), so this module stays pure and testable.
 */

export type Density = 'mdpi' | 'hdpi' | 'xhdpi' | 'xxhdpi' | 'xxxhdpi';

export const DENSITY_SCALE: Record<Density, number> = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
export const DENSITIES = Object.keys(DENSITY_SCALE) as Density[];

/** Legacy launcher icon size in dp. */
export const LEGACY_DP = 48;
/** Adaptive icon layer size in dp; the system masks it down to ~72dp visible. */
export const ADAPTIVE_DP = 108;
/** Inner area of an adaptive layer guaranteed not to be clipped by any mask. */
export const SAFE_ZONE_DP = 66;

export type LayerKind =
  | 'legacy' // full icon: background + foreground, rounded square
  | 'legacy-round' // full icon in a circle
  | 'foreground' // adaptive foreground, transparent
  | 'background' // adaptive background bitmap (only when not a solid color)
  | 'monochrome' // themed-icon silhouette
  | 'play-store' // 512 px, full bleed square, opaque
  | 'ios'; // 1024 px, full bleed square, opaque

export interface Bitmap {
  path: string;
  size: number;
  kind: LayerKind;
}

export interface IconOptions {
  /** Resource name, e.g. ic_launcher. */
  name: string;
  /** Solid background colour, #RRGGBB. */
  backgroundColor: string;
  /** Include the Android 13+ themed (monochrome) layer. */
  monochrome: boolean;
  includeAndroid: boolean;
  includePlayStore: boolean;
  includeIos: boolean;
}

export const defaultIconOptions: IconOptions = {
  name: 'ic_launcher',
  backgroundColor: '#0F8A4A',
  monochrome: true,
  includeAndroid: true,
  includePlayStore: true,
  includeIos: true,
};

export function isValidResourceName(name: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(name);
}

export function normalizeHex(color: string): string | null {
  const m = color.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const hex = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return `#${hex.toUpperCase()}`;
}

export function bitmaps(o: IconOptions): Bitmap[] {
  const out: Bitmap[] = [];
  if (o.includeAndroid) {
    for (const d of DENSITIES) {
      const s = DENSITY_SCALE[d];
      const dir = `android/res/mipmap-${d}`;
      out.push({ path: `${dir}/${o.name}.png`, size: LEGACY_DP * s, kind: 'legacy' });
      out.push({ path: `${dir}/${o.name}_round.png`, size: LEGACY_DP * s, kind: 'legacy-round' });
      out.push({ path: `${dir}/${o.name}_foreground.png`, size: ADAPTIVE_DP * s, kind: 'foreground' });
      if (o.monochrome) out.push({ path: `${dir}/${o.name}_monochrome.png`, size: ADAPTIVE_DP * s, kind: 'monochrome' });
    }
  }
  if (o.includePlayStore) out.push({ path: 'play-store/ic_launcher-playstore.png', size: 512, kind: 'play-store' });
  if (o.includeIos) out.push({ path: 'ios/AppIcon.appiconset/AppIcon-1024.png', size: 1024, kind: 'ios' });
  return out;
}

export function adaptiveIconXml(o: IconOptions): string {
  const mono = o.monochrome ? `\n    <monochrome android:drawable="@mipmap/${o.name}_monochrome" />` : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/${o.name}_background" />
    <foreground android:drawable="@mipmap/${o.name}_foreground" />${mono}
</adaptive-icon>
`;
}

export function backgroundColorXml(o: IconOptions): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="${o.name}_background">${normalizeHex(o.backgroundColor) ?? '#FFFFFF'}</color>
</resources>
`;
}

/** Xcode 14+ single-size app icon. */
export function iosContentsJson(): string {
  return `${JSON.stringify(
    {
      images: [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
      info: { author: 'xcode', version: 1 },
    },
    null,
    2,
  )}\n`;
}

/** Text files that accompany the bitmaps. */
export function textFiles(o: IconOptions): { path: string; data: string }[] {
  const out: { path: string; data: string }[] = [];
  if (o.includeAndroid) {
    out.push({ path: `android/res/mipmap-anydpi-v26/${o.name}.xml`, data: adaptiveIconXml(o) });
    out.push({ path: `android/res/mipmap-anydpi-v26/${o.name}_round.xml`, data: adaptiveIconXml(o) });
    out.push({ path: `android/res/values/${o.name}_background.xml`, data: backgroundColorXml(o) });
  }
  if (o.includeIos) out.push({ path: 'ios/AppIcon.appiconset/Contents.json', data: iosContentsJson() });
  return out;
}

/**
 * Where to draw the source image inside a square layer of `size` px.
 * `scale` is the share of the 108dp adaptive canvas the artwork's longest side should take.
 * Legacy icons use the visible 72dp area as their canvas, so the same artwork looks the same size.
 */
export function artworkRect(kind: LayerKind, size: number, scale: number, aspect: number): { x: number; y: number; w: number; h: number } {
  const canvasShare = kind === 'foreground' || kind === 'monochrome' ? scale : Math.min(1, (scale * ADAPTIVE_DP) / 72);
  const box = size * canvasShare;
  const w = aspect >= 1 ? box : box * aspect;
  const h = aspect >= 1 ? box / aspect : box;
  return { x: (size - w) / 2, y: (size - h) / 2, w, h };
}

/** True when artwork of this scale spills outside the adaptive safe zone. */
export function exceedsSafeZone(scale: number): boolean {
  return scale * ADAPTIVE_DP > SAFE_ZONE_DP + 0.01;
}
