import { describe, expect, it } from 'vitest';
import { alphaHex, ColorParseError, colorFormats, fmt, fromPx, parseColor, toPx } from './index.ts';

describe('density units', () => {
  it('converts dp to px per density', () => {
    expect(toPx(16, 'dp', 160)).toBe(16);
    expect(toPx(16, 'dp', 480)).toBe(48);
    expect(toPx(48, 'dp', 240)).toBe(72);
    expect(fmt(toPx(10, 'dp', 213))).toBe('13.31');
  });

  it('applies the font scale to sp only', () => {
    expect(toPx(14, 'sp', 320, 1.3)).toBeCloseTo(36.4);
    expect(toPx(14, 'dp', 320, 1.3)).toBe(28);
  });

  it('converts back from px', () => {
    expect(fromPx(48, 'dp', 480)).toBe(16);
    expect(fromPx(36.4, 'sp', 320, 1.3)).toBeCloseTo(14);
    expect(fromPx(10, 'px', 480)).toBe(10);
  });
});

describe('parseColor', () => {
  it('reads Android ARGB hex by default', () => {
    expect(parseColor('#800F8A4A')).toEqual({ a: 128 / 255, r: 15, g: 138, b: 74 });
    expect(parseColor('#0F8A4A')).toEqual({ a: 1, r: 15, g: 138, b: 74 });
    expect(parseColor('#8F0F')).toEqual({ a: 136 / 255, r: 255, g: 0, b: 255 });
  });

  it('reads CSS RGBA hex when asked', () => {
    expect(parseColor('#0F8A4A80', 'rgba')).toEqual({ r: 15, g: 138, b: 74, a: 128 / 255 });
  });

  it('always reads 0x and Color(0x…) as ARGB', () => {
    expect(parseColor('0xFF0F8A4A', 'rgba')).toEqual({ a: 1, r: 15, g: 138, b: 74 });
    expect(parseColor('Color(0xFF0F_8A4A)')).toEqual({ a: 1, r: 15, g: 138, b: 74 });
  });

  it('reads rgb(), hsl() and names', () => {
    expect(parseColor('rgb(15, 138, 74)')).toEqual({ r: 15, g: 138, b: 74, a: 1 });
    expect(parseColor('rgba(15 138 74 / 50%)')).toEqual({ r: 15, g: 138, b: 74, a: 0.5 });
    const c = parseColor('hsl(120, 100%, 25%)');
    expect([Math.round(c.r), Math.round(c.g), Math.round(c.b)]).toEqual([0, 128, 0]);
    expect(parseColor('white')).toEqual({ a: 1, r: 255, g: 255, b: 255 });
  });

  it('rejects junk', () => {
    expect(() => parseColor('#12345')).toThrow(ColorParseError);
    expect(() => parseColor('banana')).toThrow(ColorParseError);
    expect(() => parseColor('rgb(1,2)')).toThrow(ColorParseError);
  });
});

describe('colorFormats', () => {
  const byLabel = (input: string) => Object.fromEntries(colorFormats(parseColor(input)).map((f) => [f.label, f.value]));

  it('formats an opaque colour', () => {
    const f = byLabel('#0F8A4A');
    expect(f['Android XML (#AARRGGBB)']).toBe('#FF0F8A4A');
    expect(f['Android XML (#RRGGBB)']).toBe('#0F8A4A');
    expect(f['Jetpack Compose']).toBe('Color(0xFF0F8A4A)');
    expect(f['Android color int']).toBe(String(0xff0f8a4a | 0));
    expect(f['CSS hex']).toBe('#0F8A4A');
    expect(f['CSS rgb()']).toBe('rgb(15 138 74)');
  });

  it('puts alpha first for Android and last for CSS', () => {
    const f = byLabel('#800F8A4A');
    expect(f['Android XML (#AARRGGBB)']).toBe('#800F8A4A');
    expect(f['Android XML (#RRGGBB)']).toBeUndefined();
    expect(f['CSS hex']).toBe('#0F8A4A80');
    expect(f['CSS rgb()']).toBe('rgb(15 138 74 / 0.502)');
  });

  it('matches Android Color.parseColor for the int', () => {
    // Color.parseColor("#FFFFFFFF") == -1, "#FF000000" == -16777216
    expect(byLabel('#FFFFFFFF')['Android color int']).toBe('-1');
    expect(byLabel('#000000')['Android color int']).toBe('-16777216');
  });
});

describe('alphaHex', () => {
  it('maps opacity to the alpha byte', () => {
    expect(alphaHex(100)).toBe('FF');
    expect(alphaHex(50)).toBe('80');
    expect(alphaHex(0)).toBe('00');
    expect(alphaHex(87)).toBe('DE');
  });
});
