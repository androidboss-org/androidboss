import { describe, expect, it } from 'vitest';
import {
  adaptiveIconXml,
  artworkRect,
  backgroundColorXml,
  bitmaps,
  defaultIconOptions,
  exceedsSafeZone,
  iosContentsJson,
  isValidResourceName,
  normalizeHex,
  textFiles,
} from './index.ts';

describe('bitmaps', () => {
  it('lists every density with the standard pixel sizes', () => {
    const b = bitmaps(defaultIconOptions);
    const legacy = b.filter((x) => x.kind === 'legacy').map((x) => x.size);
    const fg = b.filter((x) => x.kind === 'foreground').map((x) => x.size);
    expect(legacy).toEqual([48, 72, 96, 144, 192]);
    expect(fg).toEqual([108, 162, 216, 324, 432]);
    expect(b.find((x) => x.kind === 'play-store')).toEqual({ path: 'play-store/ic_launcher-playstore.png', size: 512, kind: 'play-store' });
    expect(b.find((x) => x.kind === 'ios')?.size).toBe(1024);
    expect(b.filter((x) => x.kind === 'monochrome')).toHaveLength(5);
  });

  it('respects toggles and the resource name', () => {
    const b = bitmaps({ ...defaultIconOptions, name: 'ic_app', monochrome: false, includeIos: false, includePlayStore: false });
    expect(b.every((x) => x.path.startsWith('android/res/mipmap-'))).toBe(true);
    expect(b.some((x) => x.path.endsWith('/ic_app_round.png'))).toBe(true);
    expect(b.some((x) => x.kind === 'monochrome')).toBe(false);
  });
});

describe('xml and json', () => {
  it('writes an adaptive icon with a monochrome layer', () => {
    const xml = adaptiveIconXml(defaultIconOptions);
    expect(xml).toContain('<background android:drawable="@color/ic_launcher_background" />');
    expect(xml).toContain('<foreground android:drawable="@mipmap/ic_launcher_foreground" />');
    expect(xml).toContain('<monochrome android:drawable="@mipmap/ic_launcher_monochrome" />');
    expect(adaptiveIconXml({ ...defaultIconOptions, monochrome: false })).not.toContain('monochrome');
  });

  it('writes the background color resource', () => {
    expect(backgroundColorXml({ ...defaultIconOptions, backgroundColor: '#abc' })).toContain('<color name="ic_launcher_background">#AABBCC</color>');
  });

  it('writes a single-size iOS Contents.json', () => {
    expect(JSON.parse(iosContentsJson()).images[0]).toEqual({ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' });
  });

  it('lists text files per platform', () => {
    expect(textFiles(defaultIconOptions).map((f) => f.path)).toEqual([
      'android/res/mipmap-anydpi-v26/ic_launcher.xml',
      'android/res/mipmap-anydpi-v26/ic_launcher_round.xml',
      'android/res/values/ic_launcher_background.xml',
      'ios/AppIcon.appiconset/Contents.json',
    ]);
  });
});

describe('helpers', () => {
  it('validates resource names', () => {
    expect(isValidResourceName('ic_launcher')).toBe(true);
    expect(isValidResourceName('IcLauncher')).toBe(false);
    expect(isValidResourceName('1icon')).toBe(false);
  });

  it('normalizes hex colors', () => {
    expect(normalizeHex('0f8a4a')).toBe('#0F8A4A');
    expect(normalizeHex('#fff')).toBe('#FFFFFF');
    expect(normalizeHex('red')).toBeNull();
  });

  it('centres artwork and keeps aspect ratio', () => {
    expect(artworkRect('foreground', 432, 0.5, 1)).toEqual({ x: 108, y: 108, w: 216, h: 216 });
    const wide = artworkRect('foreground', 100, 0.5, 2);
    expect(wide).toEqual({ x: 25, y: 37.5, w: 50, h: 25 });
  });

  it('draws legacy artwork relative to the visible 72dp area', () => {
    // 0.5 of 108dp = 54dp, which is 75% of 72dp
    expect(artworkRect('legacy', 192, 0.5, 1).w).toBeCloseTo(144);
  });

  it('flags artwork outside the 66dp safe zone', () => {
    expect(exceedsSafeZone(0.6)).toBe(false);
    expect(exceedsSafeZone(0.7)).toBe(true);
  });
});
