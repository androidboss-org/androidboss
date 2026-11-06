import { describe, expect, it } from 'vitest';
import { convertVector, detectFormat, svgToImage, toVectorDrawable, vectorDrawableToImage, VectorError } from './index.ts';
import { parsePath } from './path.ts';
import { parseXml } from './xml.ts';
import { SAMPLE_SVG } from './fixtures.ts';


describe('xml', () => {
  it('parses attributes, entities, comments and self-closing tags', () => {
    const el = parseXml('<?xml version="1.0"?><!DOCTYPE svg [ <!ENTITY x "y"> ]><a b="1 &amp; 2"><!-- c --><d e=\'f\'/></a>');
    expect(el).toEqual({ name: 'a', attrs: { b: '1 & 2' }, children: [{ name: 'd', attrs: { e: 'f' }, children: [] }] });
  });
  it('rejects broken XML', () => {
    expect(() => parseXml('<a><b></a>')).toThrow();
  });
});

describe('path data', () => {
  it('handles implicit commands, packed numbers and arc flags', () => {
    expect(parsePath('M1 2 3 4')).toEqual([{ cmd: 'M', args: [1, 2] }, { cmd: 'L', args: [3, 4] }]);
    expect(parsePath('m1.5.5-2-3z')).toEqual([{ cmd: 'm', args: [1.5, 0.5] }, { cmd: 'l', args: [-2, -3] }, { cmd: 'z', args: [] }]);
    expect(parsePath('M0 0a5 5 0 0110 10')).toEqual([{ cmd: 'M', args: [0, 0] }, { cmd: 'a', args: [5, 5, 0, 0, 1, 10, 10] }]);
    expect(() => parsePath('L1')).toThrow();
  });
});

describe('svgToImage', () => {
  const { image, warnings } = svgToImage(SAMPLE_SVG);
  const [rect, group, check, holes] = image.children;

  it('reads size and shapes', () => {
    expect(image).toMatchObject({ width: 24, height: 24, viewportWidth: 24, viewportHeight: 24 });
    expect(rect).toMatchObject({ type: 'path', fill: { r: 15, g: 138, b: 74, a: 1 }, stroke: null });
    expect(rect!.type === 'path' && rect!.d.startsWith('M6,2h12a4,4')).toBe(true);
  });

  it('nests transforms and multiplies opacity', () => {
    expect(group!.type).toBe('group');
    if (group!.type !== 'group') return;
    expect(group!.transform).toMatchObject({ translateX: 12, translateY: 12 });
    const inner = group!.children[0]!;
    expect(inner.type === 'group' && inner.transform.rotation).toBe(45);
    const circle = inner.type === 'group' ? inner.children[0]! : inner;
    expect(circle).toMatchObject({ fillAlpha: 0.5, strokeAlpha: 0.5, strokeWidth: 2, cap: 'round' });
  });

  it('reads inline style, rgba() alpha and even-odd fill', () => {
    expect(check).toMatchObject({ fill: null, strokeWidth: 2, join: 'round' });
    expect(holes).toMatchObject({ evenOdd: true, fillAlpha: 0.25 });
    expect(warnings).toEqual([]);
  });

  it('offsets a non-zero viewBox origin and warns about unsupported content', () => {
    const r = svgToImage('<svg viewBox="10 10 20 20"><text>hi</text><path d="M10 10h5" stroke="url(#g)"/></svg>');
    expect(r.image.children[0]).toMatchObject({ type: 'group', transform: { translateX: -10, translateY: -10 } });
    expect(r.warnings.join(' ')).toMatch(/text/);
    expect(r.warnings.join(' ')).toMatch(/Gradients/);
  });
});

describe('outputs', () => {
  it('writes a VectorDrawable', () => {
    const xml = convertVector(SAMPLE_SVG, 'vector-drawable').output;
    expect(xml).toContain('android:viewportWidth="24"');
    expect(xml).toContain('android:fillColor="#FF0F8A4A"');
    expect(xml).toContain('android:fillType="evenOdd"');
    expect(xml).toContain('android:strokeLineCap="round"');
    expect(xml).toContain('android:rotation="45"');
    expect(xml).toContain('android:fillAlpha="0.25"');
  });

  it('writes Compose ImageVector code', () => {
    const kt = convertVector(SAMPLE_SVG, 'image-vector', { name: 'Check', packageName: 'com.example.icons' }).output;
    expect(kt.startsWith('package com.example.icons\n\nimport androidx.compose.ui.graphics.Color\n')).toBe(true);
    expect(kt).toContain('val Check: ImageVector\n    get() {\n        if (_check != null) return _check!!');
    expect(kt).toContain('fill = SolidColor(Color(0xFF0F8A4A))');
    expect(kt).toContain('pathFillType = PathFillType.EvenOdd');
    expect(kt).toContain('arcToRelative(4f, 4f, 0f, false, true, 4f, 4f)');
    expect(kt).toContain('group(rotate = 45f) {');
    expect(kt).toContain('strokeLineJoin = StrokeJoin.Round');
    expect(kt).not.toMatch(/[^\d]\.\d+f/); // Kotlin needs 0.5f, not .5f
  });

  it('round-trips VectorDrawable → SVG → VectorDrawable', () => {
    const vd = toVectorDrawable(svgToImage(SAMPLE_SVG).image);
    const svg = convertVector(vd, 'svg').output;
    const back = toVectorDrawable(svgToImage(svg).image);
    expect(vectorDrawableToImage(back).image.children.length).toBe(vectorDrawableToImage(vd).image.children.length);
    expect(back).toContain('android:pathData="M7,12l3,3l7,-7"');
  });

  it('reads VectorDrawable groups, alpha and resource colours', () => {
    const r = vectorDrawableToImage(`<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="48dp" android:height="48dp" android:viewportWidth="24" android:viewportHeight="24" android:tint="?attr/colorControlNormal">
      <group android:rotation="90" android:pivotX="12" android:pivotY="12"><path android:fillColor="@color/brand" android:fillAlpha="0.5" android:pathData="M0,0h1v1z"/></group></vector>`);
    expect(r.image.width).toBe(48);
    expect(r.image.children[0]).toMatchObject({ type: 'group', transform: { rotation: 90, pivotX: 12 } });
    expect(r.warnings.join(' ')).toMatch(/@color\/brand/);
    expect(r.warnings.join(' ')).toMatch(/tint/);
  });

  it('detects input formats and rejects others', () => {
    expect(detectFormat('<svg/>')).toBe('svg');
    expect(detectFormat('<vector/>')).toBe('vector-drawable');
    expect(() => convertVector('hello', 'svg')).toThrow(VectorError);
  });
});
