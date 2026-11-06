import { describe, expect, it } from 'vitest';
import { encodeRgbaPng, encodeRgbPng } from '../png/index.ts';
import { checkAppStoreScreenshot, checkFeatureGraphic, checkPlayScreenshot, imageInfo, promotionalWords, SCREENSHOT_PRESETS, slideLayout, wrapText } from './index.ts';

const px = (w: number, h: number) => new Uint8Array(w * h * 4).fill(255);

/** Smallest JPEG header that carries a SOF0 frame size. */
function jpegHeader(w: number, h: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]);
}

describe('imageInfo', () => {
  it('reads PNG size and alpha, and JPEG size', async () => {
    expect(imageInfo(await encodeRgbPng(3, 2, px(3, 2)))).toEqual({ format: 'png', width: 3, height: 2, hasAlpha: false });
    expect(imageInfo(await encodeRgbaPng(3, 2, px(3, 2)))).toMatchObject({ hasAlpha: true });
    expect(imageInfo(jpegHeader(1080, 1920))).toEqual({ format: 'jpeg', width: 1080, height: 1920, hasAlpha: false });
    expect(imageInfo(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });
});

describe('store checks', () => {
  const img = (width: number, height: number, hasAlpha = false) => ({ format: 'png' as const, width, height, hasAlpha });

  it('applies Play size, ratio, alpha and promotion rules', () => {
    expect(checkPlayScreenshot(img(1080, 1920))[0]!.text).toMatch(/counts towards promotion/);
    expect(checkPlayScreenshot(img(1080, 2400))[0]!.text).toMatch(/twice/);
    expect(checkPlayScreenshot(img(720, 1280))[0]).toMatchObject({ ok: true, text: expect.stringMatching(/^Fits Play, but/) });
    expect(checkPlayScreenshot(img(4000, 2250))[0]!.ok).toBe(false);
    expect(checkPlayScreenshot(img(1080, 1920, true))[0]!.text).toMatch(/alpha/);
  });

  it('matches exact App Store sizes in either orientation', () => {
    expect(checkAppStoreScreenshot(img(1320, 2868))[0]!.text).toBe('Matches App Store iPhone 6.9″.');
    expect(checkAppStoreScreenshot(img(2622, 1206))[0]!.text).toBe('Matches App Store iPhone 6.1″.');
    expect(checkAppStoreScreenshot(img(1080, 1920))[0]!.ok).toBe(false);
  });

  it('checks the feature graphic', () => {
    expect(checkFeatureGraphic(img(1024, 500))[0]!.ok).toBe(true);
    expect(checkFeatureGraphic(img(1024, 500, true))[0]!.ok).toBe(false);
  });

  it('every preset passes its own store check', () => {
    for (const p of SCREENSHOT_PRESETS) {
      const v = (p.store === 'play' ? checkPlayScreenshot : checkAppStoreScreenshot)(img(p.width, p.height));
      expect(v.every((x) => x.ok), p.id).toBe(true);
    }
  });
});

describe('text', () => {
  it('finds promotional words but not parts of other words', () => {
    expect(promotionalWords('The #1 BEST budget app, free forever')).toEqual(['#1', 'best', 'free']);
    expect(promotionalWords('Freedom to stop newsletters at the bestiary')).toEqual([]);
  });

  it('wraps by measured width and keeps explicit breaks', () => {
    const measure = (s: string) => s.length * 10;
    expect(wrapText('Track every expense in seconds', 120, measure)).toEqual(['Track every', 'expense in', 'seconds']);
    expect(wrapText('Plan\nyour week', 500, measure)).toEqual(['Plan', 'your week']);
  });
});

describe('slideLayout', () => {
  it('keeps the device inside the slide and the caption clear of it', () => {
    for (const p of SCREENSHOT_PRESETS)
      for (const captionPosition of ['top', 'bottom'] as const)
        for (const shotAspect of [1080 / 2400, 9 / 16, 16 / 9]) {
          const l = slideLayout({ width: p.width, height: p.height, shotAspect, captionLines: 2, captionPosition, frame: true });
          expect(l.device.x).toBeGreaterThanOrEqual(0);
          expect(l.device.x + l.device.w).toBeLessThanOrEqual(p.width);
          expect(l.device.y + l.device.h).toBeLessThanOrEqual(p.height);
          const clear = captionPosition === 'top' ? l.device.y >= l.caption.y + l.caption.h : l.device.y + l.device.h <= l.caption.y;
          expect(clear, `${p.id} ${captionPosition}`).toBe(true);
          expect(l.screen.w / l.screen.h).toBeCloseTo(shotAspect, 1);
          expect(l.captionShare).toBeLessThanOrEqual(0.2);
        }
  });
});

describe('status bar scripts', () => {
  it('targets a display only when asked', async () => {
    const { androidCleanStatusBar } = await import('./index.ts');
    expect(androidCleanStatusBar()).toContain('screencap -p > screenshot-1.png');
    expect(androidCleanStatusBar('4619827551948147201')).toContain('screencap -p -d 4619827551948147201 >');
  });
});
