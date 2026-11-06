/**
 * Play Store and App Store screenshot and feature graphic rules, image header
 * checks, and the layout used to compose captioned screenshots.
 *
 * Google Play: support.google.com/googleplay/android-developer/answer/9866151
 * App Store: developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
 */

export const STORE_RULES_CHECKED_ON = '2026-11-03';

export type Store = 'play' | 'appstore';

export interface Preset {
  id: string;
  store: Store;
  name: string;
  width: number;
  height: number;
  /** Folder name inside the downloaded zip. */
  folder: string;
  note: string;
}

export const SCREENSHOT_PRESETS: Preset[] = [
  { id: 'play-phone', store: 'play', name: 'Play phone (9:16)', width: 1080, height: 1920, folder: 'play-phone', note: 'Eligible for promotion with at least 4 screenshots at 1080×1920 or larger.' },
  { id: 'play-phone-hd', store: 'play', name: 'Play phone, sharper (9:16)', width: 1440, height: 2560, folder: 'play-phone', note: 'Same 9:16 shape at a higher resolution.' },
  { id: 'play-tablet', store: 'play', name: 'Play tablet & Chromebook (16:9)', width: 2560, height: 1440, folder: 'play-tablet', note: 'Large screens need at least 4 screenshots, 1080–7680 px, 16:9 or 9:16.' },
  { id: 'ios-69', store: 'appstore', name: 'App Store iPhone 6.9″', width: 1320, height: 2868, folder: 'appstore-iphone-6.9', note: 'Largest iPhone size. App Store Connect scales it down for smaller iPhones.' },
  { id: 'ios-61', store: 'appstore', name: 'App Store iPhone 6.1″', width: 1206, height: 2622, folder: 'appstore-iphone-6.1', note: 'The iPhone size App Store Connect requires (Dynamic Island, medium display).' },
  { id: 'ios-ipad-13', store: 'appstore', name: 'App Store iPad 13″', width: 2064, height: 2752, folder: 'appstore-ipad-13', note: 'Required if the app runs on iPad.' },
];

export const FEATURE_GRAPHIC = { width: 1024, height: 500 } as const;

/** Every portrait size App Store Connect accepts for the iPhone and iPad classes above. */
const APP_STORE_SIZES: { name: string; sizes: [number, number][] }[] = [
  { name: 'iPhone 6.9″', sizes: [[1320, 2868], [1290, 2796], [1260, 2736]] },
  { name: 'iPhone 6.5″', sizes: [[1284, 2778], [1242, 2688]] },
  { name: 'iPhone 6.1″', sizes: [[1206, 2622], [1179, 2556]] },
  { name: 'iPad 13″', sizes: [[2064, 2752], [2048, 2732]] },
];

export interface ImageInfo {
  format: 'png' | 'jpeg';
  width: number;
  height: number;
  /** PNG colour type 4 or 6, or a tRNS chunk. JPEG never has alpha. */
  hasAlpha: boolean;
}

const u32 = (b: Uint8Array, o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;

/** Reads dimensions and alpha from PNG or JPEG bytes without decoding pixels. */
export function imageInfo(b: Uint8Array): ImageInfo | undefined {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const width = u32(b, 16);
    const height = u32(b, 20);
    const colorType = b[25]!;
    let trns = false;
    for (let o = 8; o + 8 <= b.length; ) {
      const len = u32(b, o);
      const type = String.fromCharCode(b[o + 4]!, b[o + 5]!, b[o + 6]!, b[o + 7]!);
      if (type === 'tRNS') trns = true;
      if (type === 'IDAT' || type === 'IEND') break;
      o += 12 + len;
    }
    return { format: 'png', width, height, hasAlpha: colorType === 4 || colorType === 6 || trns };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let o = 2; o + 9 < b.length; ) {
      if (b[o] !== 0xff) return undefined;
      const marker = b[o + 1]!;
      if (marker === 0xff) {
        o++;
        continue;
      }
      const len = (b[o + 2]! << 8) | b[o + 3]!;
      // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { format: 'jpeg', height: (b[o + 5]! << 8) | b[o + 6]!, width: (b[o + 7]! << 8) | b[o + 8]!, hasAlpha: false };
      o += 2 + len;
    }
  }
  return undefined;
}

export interface Verdict {
  ok: boolean;
  text: string;
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

/** Whether an image can be uploaded as a Google Play phone screenshot, and whether it counts for promotion. */
export function checkPlayScreenshot(i: ImageInfo): Verdict[] {
  const long = Math.max(i.width, i.height);
  const short = Math.min(i.width, i.height);
  const out: Verdict[] = [];
  if (i.hasAlpha) out.push({ ok: false, text: 'Has an alpha channel. Play wants JPEG or 24-bit PNG.' });
  if (short < 320 || long > 3840) out.push({ ok: false, text: `Each side must be 320–3840 px (this is ${i.width}×${i.height}).` });
  if (long > short * 2) out.push({ ok: false, text: 'The long side is more than twice the short side.' });
  if (out.length) return out;
  const promo = near(long / short, 16 / 9) && short >= 1080;
  out.push({ ok: true, text: promo ? 'Fits Play, and counts towards promotion (9:16 or 16:9, 1080 px or more).' : 'Fits Play, but only 9:16 or 16:9 at 1080 px or more counts towards promotion.' });
  return out;
}

/** Which App Store Connect screenshot size an image matches exactly, if any. */
export function checkAppStoreScreenshot(i: ImageInfo): Verdict[] {
  if (i.hasAlpha) return [{ ok: false, text: 'Has an alpha channel. App Store Connect rejects transparency.' }];
  const [w, h] = i.width < i.height ? [i.width, i.height] : [i.height, i.width];
  const match = APP_STORE_SIZES.find((c) => c.sizes.some(([a, b]) => a === w && b === h));
  return [match ? { ok: true, text: `Matches App Store ${match.name}.` } : { ok: false, text: `${i.width}×${i.height} is not a size App Store Connect accepts for iPhone or iPad.` }];
}

export function checkFeatureGraphic(i: ImageInfo): Verdict[] {
  const out: Verdict[] = [];
  if (i.width !== FEATURE_GRAPHIC.width || i.height !== FEATURE_GRAPHIC.height) out.push({ ok: false, text: `Must be exactly 1024×500 (this is ${i.width}×${i.height}).` });
  if (i.hasAlpha) out.push({ ok: false, text: 'Has an alpha channel. Play wants JPEG or 24-bit PNG.' });
  return out.length ? out : [{ ok: true, text: 'Fits the Play feature graphic.' }];
}

/** Ranking, price and promotional words Google Play's metadata policy keeps out of graphics, plus store names. */
const PROMO = /(?<![\w#])(#\s?1|no\.?\s?1|number one|best|top|free|sale|discount|% off|new|download now|install now|google play|app store|editor'?s choice)(?![\w])/gi;

export function promotionalWords(text: string): string[] {
  return [...new Set([...text.matchAll(PROMO)].map((m) => m[0].toLowerCase()))];
}

/** Greedy word wrap with an injected text measure (canvas measureText in the browser). Honours explicit line breaks. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SlideOptions {
  width: number;
  height: number;
  /** Width / height of the raw screenshot. */
  shotAspect: number;
  captionLines: number;
  captionPosition: 'top' | 'bottom';
  frame: boolean;
}

export interface SlideLayout {
  fontSize: number;
  lineHeight: number;
  /** Area the caption block takes, padding included; Play asks for 20% of the image or less. */
  caption: Rect;
  /** First baseline-free line box: line i is at caption.y + padY + i * lineHeight. */
  textTop: number;
  device: Rect;
  screen: Rect;
  deviceRadius: number;
  screenRadius: number;
  captionShare: number;
}

/** Positions caption and device on a slide, scaled from the short side so every preset looks alike. */
export function slideLayout(o: SlideOptions): SlideLayout {
  const unit = Math.min(o.width, o.height);
  const pad = Math.round(unit * 0.07);
  const fontSize = Math.round(unit * (o.width > o.height ? 0.06 : 0.068));
  const lineHeight = Math.round(fontSize * 1.18);
  const captionH = o.captionLines ? pad * 2 + lineHeight * o.captionLines : pad;
  const caption: Rect = { x: 0, y: o.captionPosition === 'top' ? 0 : o.height - captionH, w: o.width, h: captionH };

  const box: Rect = { x: pad, y: o.captionPosition === 'top' ? captionH : pad, w: o.width - pad * 2, h: o.height - captionH - pad };
  const bezel = o.frame ? Math.round(unit * 0.018) : 0;
  // Fit the screenshot plus bezel into the box.
  let sw = box.w - bezel * 2;
  let sh = sw / o.shotAspect;
  if (sh + bezel * 2 > box.h) {
    sh = box.h - bezel * 2;
    sw = sh * o.shotAspect;
  }
  sw = Math.round(sw);
  sh = Math.round(sh);
  const device: Rect = { x: Math.round(box.x + (box.w - sw - bezel * 2) / 2), y: o.captionPosition === 'top' ? box.y : box.y + box.h - sh - bezel * 2, w: sw + bezel * 2, h: sh + bezel * 2 };
  const screen: Rect = { x: device.x + bezel, y: device.y + bezel, w: sw, h: sh };
  const screenRadius = Math.round(Math.min(sw, sh) * 0.06);
  return {
    fontSize,
    lineHeight,
    caption,
    textTop: caption.y + pad,
    device,
    screen,
    deviceRadius: screenRadius + bezel,
    screenRadius,
    captionShare: o.captionLines ? (lineHeight * o.captionLines) / o.height : 0,
  };
}

/**
 * Clean status bar for Android screenshots with System UI demo mode. Checked on
 * an Android 17 emulator: the clock, Wi-Fi and battery overrides work, but the
 * `notifications` command no longer hides notification icons and `datatype`
 * no longer removes the network label, so notifications are snoozed instead
 * and the mobile signal is hidden.
 */
export function androidCleanStatusBar(display?: string): string {
  const d = display ? ` -d ${display}` : '';
  return `adb shell settings put global sysui_demo_allowed 1
demo() { adb shell am broadcast -a com.android.systemui.demo -e command "$@" > /dev/null; }
demo enter
demo clock -e hhmm 0941
demo battery -e level 100 -e plugged false
demo network -e wifi show -e level 4 -e fully true
demo network -e mobile hide
# Snooze every notification for an hour so no icons show next to the clock.
adb shell cmd notification list | tr -d '\\r' | while read -r key; do
  adb shell "cmd notification snooze --for 3600000 '$key'" < /dev/null
done

adb exec-out screencap -p${d} > screenshot-1.png

# When you are done:
demo exit`;
}

/** The same for the iOS Simulator (Xcode's simctl). */
export const IOS_CLEAN_STATUS_BAR = `xcrun simctl status_bar booted override --time 9:41 --dataNetwork wifi --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
xcrun simctl io booted screenshot screenshot-1.png

# When you are done:
xcrun simctl status_bar booted clear`;
