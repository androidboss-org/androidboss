import { describe, expect, it } from 'vitest';
import { FIXED_ROLES, generateTheme, palettes, ROLES, ThemeError } from './index.ts';

describe('palettes', () => {
  // Reference values from Material Theme Builder's Compose export for seed #6750A4 (tonal spot).
  it('matches Material Theme Builder for the baseline seed', () => {
    const { light, dark } = palettes({ seed: '#6750A4', variant: 'tonalSpot', contrast: 0 });
    expect(light.primary).toBe('#65558F');
    expect(light.onPrimary).toBe('#FFFFFF');
    expect(light.primaryContainer).toBe('#E9DDFF');
    expect(light.surface).toBe('#FDF7FF');
    expect(dark.primary).toBe('#CFBDFE');
    expect(dark.surface).toBe('#141218');
  });

  it('produces every role in light and dark', () => {
    const { light, dark } = palettes({ seed: '#0F8A4A', variant: 'vibrant', contrast: 0.5 });
    for (const r of [...ROLES, ...FIXED_ROLES]) {
      expect(light[r]).toMatch(/^#[0-9A-F]{6}$/);
      expect(dark[r]).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('rejects a bad seed', () => {
    expect(() => palettes({ seed: 'green', variant: 'tonalSpot', contrast: 0 })).toThrow(ThemeError);
  });
});

describe('generateTheme', () => {
  it('writes Color.kt and Theme.kt', () => {
    const t = generateTheme({ seed: '#6750A4', packageName: 'com.example.ui.theme', themeName: 'ShopTheme' });
    expect(t.colorKt).toContain('package com.example.ui.theme\n\nimport androidx.compose.ui.graphics.Color');
    expect(t.colorKt).toContain('val primaryLight = Color(0xFF65558F)');
    expect(t.colorKt).toContain('val surfaceDark = Color(0xFF141218)');
    expect(t.colorKt).not.toContain('primaryFixed');
    expect(t.themeKt).toContain('private val LightColorScheme = lightColorScheme(\n    primary = primaryLight,');
    expect(t.themeKt).toContain('fun ShopTheme(');
    expect(t.themeKt).not.toContain('dynamicLightColorScheme');
  });

  it('adds dynamic colour on Android only', () => {
    expect(generateTheme({ dynamicColor: true }).themeKt).toContain('dynamicLightColorScheme(context)');
    const kmp = generateTheme({ dynamicColor: true, platform: 'multiplatform' }).themeKt;
    expect(kmp).not.toContain('android.');
    expect(kmp).not.toContain('LocalContext');
  });

  it('adds fixed colours on request', () => {
    const t = generateTheme({ fixedColors: true });
    expect(t.themeKt).toContain('    onTertiaryFixedVariant = onTertiaryFixedVariantLight,');
  });

  it('validates the package name', () => {
    expect(() => generateTheme({ packageName: 'com..x' })).toThrow(ThemeError);
  });
});
