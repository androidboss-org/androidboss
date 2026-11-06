import { describe, expect, it } from 'vitest';
import { encodeRgbaPng } from '../png/index.ts';
import { svgToImage, toVectorDrawable } from '../vector/index.ts';
import { analyzeMask, fitMask, iconSizes, isValidIconName, maskBounds, snippets, toMask, vectorIcon, whiteRgba, type Mask } from './index.ts';

/** RGBA image of a filled circle (opaque black) on transparent, or on white when `background`. */
function circle(size: number, r: number, background = false): Uint8ClampedArray {
  const px = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inside = (x + 0.5 - size / 2) ** 2 + (y + 0.5 - size / 2) ** 2 <= r * r;
      const v = inside ? 0 : 255;
      px[i] = px[i + 1] = px[i + 2] = v;
      px[i + 3] = inside || background ? 255 : 0;
    }
  return px;
}

const total = (m: Mask) => m.data.reduce((a, b) => a + b, 0);

describe('toMask', () => {
  it('uses alpha, or dark or light pixels of opaque images', () => {
    const transparent = toMask(circle(64, 20), 64, 64, 'alpha');
    const onWhite = toMask(circle(64, 20, true), 64, 64, 'dark');
    const inverted = toMask(circle(64, 20, true), 64, 64, 'light');
    expect(total(transparent)).toBeCloseTo(total(onWhite), 0);
    expect(total(inverted)).toBeCloseTo(64 * 64 - total(onWhite), 0);
    // Alpha on an opaque image covers everything.
    expect(total(toMask(circle(64, 20, true), 64, 64, 'alpha'))).toBe(64 * 64);
  });
});

describe('analyzeMask', () => {
  it('accepts a normal shape', () => {
    const r = analyzeMask(toMask(circle(64, 20), 64, 64));
    expect(r.warnings).toEqual([]);
    expect(r.fill).toBeCloseTo(Math.PI / 4, 1);
  });

  it('warns about solid blocks, faint and empty images', () => {
    expect(analyzeMask(toMask(circle(64, 20, true), 64, 64, 'alpha')).warnings[0]).toMatch(/plain white square/);
    const faint = { width: 8, height: 8, data: new Float32Array(64).fill(0.5) };
    expect(analyzeMask(faint).warnings.join()).toMatch(/semi-transparent/);
    expect(analyzeMask({ width: 4, height: 4, data: new Float32Array(16) })).toMatchObject({ empty: true });
  });
});

describe('fitMask', () => {
  it('centres the content inside the padding', () => {
    // A small circle in the corner of a big canvas still fills the icon.
    const px = new Uint8ClampedArray(200 * 200 * 4);
    const small = circle(40, 20);
    for (let y = 0; y < 40; y++) px.set(small.subarray(y * 160, y * 160 + 160), (y * 200) * 4);
    const fitted = fitMask(toMask(px, 200, 200), 96, 8);
    expect(maskBounds(fitted)).toEqual({ x: 8, y: 8, width: 80, height: 80 });
    expect(total(fitted)).toBeCloseTo(Math.PI * 40 * 40, -2);
  });

  it('keeps the aspect ratio', () => {
    const wide = { width: 100, height: 20, data: new Float32Array(2000).fill(1) };
    expect(maskBounds(fitMask(wide, 48, 4))).toEqual({ x: 4, y: 20, width: 40, height: 8 });
  });
});

describe('output', () => {
  it('makes white pixels with the mask as alpha, and a valid PNG', async () => {
    const m = fitMask(toMask(circle(64, 30), 64, 64), 24, 2);
    const px = whiteRgba(m);
    expect([px[0], px[1], px[2], px[3]]).toEqual([255, 255, 255, 0]);
    const centre = (12 * 24 + 12) * 4;
    expect(px[centre + 3]).toBe(255);
    const png = await encodeRgbaPng(24, 24, px);
    expect([...png.subarray(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
    expect(png[25]).toBe(6); // colour type RGBA
  });

  it('lists every density', () => {
    expect(iconSizes('ic_stat_shop').map((s) => `${s.path}:${s.size}`)).toEqual([
      'res/drawable-mdpi/ic_stat_shop.png:24',
      'res/drawable-hdpi/ic_stat_shop.png:36',
      'res/drawable-xhdpi/ic_stat_shop.png:48',
      'res/drawable-xxhdpi/ic_stat_shop.png:72',
      'res/drawable-xxxhdpi/ic_stat_shop.png:96',
    ]);
    expect(['ic_stat_shop', 'IcStat', '1icon', 'ic-stat'].map(isValidIconName)).toEqual([true, false, false, false]);
  });

  it('turns an SVG into a white 24dp vector fitted to the padding', () => {
    const { image } = svgToImage('<svg viewBox="0 0 100 50"><rect x="10" y="10" width="40" height="20" fill="#e91e63"/><path d="M60 10h30v20H60z" stroke="#333" stroke-width="2" fill="none"/></svg>');
    const xml = toVectorDrawable(vectorIcon(image, { x: 10, y: 9, width: 81, height: 22 }));
    expect(xml).toContain('android:width="24dp"');
    expect(xml).toContain('android:viewportWidth="24"');
    expect(xml).toContain('android:fillColor="#FFFFFFFF"');
    expect(xml).toContain('android:strokeColor="#FFFFFFFF"');
    expect(xml).not.toMatch(/E91E63|333333/i);
    expect(xml).toContain('android:scaleX="0.247"');
    expect(xml).toContain('android:translateX="-0.469"');
  });

  it('writes code with the accent colour', () => {
    const s = snippets('ic_stat_shop', '#e91e63');
    expect(s.kotlin).toContain('.setSmallIcon(R.drawable.ic_stat_shop)');
    expect(s.kotlin).toContain('.setColor(0xFFE91E63.toInt())');
    expect(s.manifest).toContain('android:resource="@drawable/ic_stat_shop"');
  });
});
