/**
 * Material 3 colour schemes for Jetpack Compose / Compose Multiplatform from one
 * seed colour, using Google's material-color-utilities (the library behind
 * Material Theme Builder and Android dynamic colour).
 *
 * Generated Kotlin is checked by compiling it against material3 (theme.android.test.ts).
 */
import {
  argbFromHex,
  DynamicColor,
  DynamicScheme,
  Hct,
  hexFromArgb,
  MaterialDynamicColors,
  SchemeContent,
  SchemeExpressive,
  SchemeFidelity,
  SchemeFruitSalad,
  SchemeMonochrome,
  SchemeNeutral,
  SchemeRainbow,
  SchemeTonalSpot,
  SchemeVibrant,
} from '@material/material-color-utilities';

const MAKERS = {
  tonalSpot: SchemeTonalSpot,
  neutral: SchemeNeutral,
  vibrant: SchemeVibrant,
  expressive: SchemeExpressive,
  fidelity: SchemeFidelity,
  content: SchemeContent,
  monochrome: SchemeMonochrome,
  rainbow: SchemeRainbow,
  fruitSalad: SchemeFruitSalad,
} as const;

export { variants, type Variant } from './variants.ts';
import { variants, type Variant } from './variants.ts';

/** ColorScheme parameters in Compose material3 order. */
export const ROLES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer', 'inversePrimary',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'background', 'onBackground', 'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant',
  'surfaceTint', 'inverseSurface', 'inverseOnSurface',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'outline', 'outlineVariant', 'scrim',
  'surfaceBright', 'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest', 'surfaceContainerLow', 'surfaceContainerLowest', 'surfaceDim',
] as const;

/** Added to ColorScheme in material3 1.4. */
export const FIXED_ROLES = [
  'primaryFixed', 'primaryFixedDim', 'onPrimaryFixed', 'onPrimaryFixedVariant',
  'secondaryFixed', 'secondaryFixedDim', 'onSecondaryFixed', 'onSecondaryFixedVariant',
  'tertiaryFixed', 'tertiaryFixedDim', 'onTertiaryFixed', 'onTertiaryFixedVariant',
] as const;

export type Role = (typeof ROLES)[number] | (typeof FIXED_ROLES)[number];

export interface ThemeOptions {
  seed: string;
  variant: Variant;
  /** -1 (reduced) … 0 (standard) … 1 (high). */
  contrast: number;
  themeName: string;
  packageName: string;
  platform: 'android' | 'multiplatform';
  /** Android 12+ wallpaper colours when available. */
  dynamicColor: boolean;
  /** Include primaryFixed & co. (needs material3 1.4+). */
  fixedColors: boolean;
}

export const defaultThemeOptions: ThemeOptions = {
  seed: '#0F8A4A',
  variant: 'tonalSpot',
  contrast: 0,
  themeName: 'AppTheme',
  packageName: 'com.example.app.ui.theme',
  platform: 'android',
  dynamicColor: false,
  fixedColors: false,
};

export class ThemeError extends Error {}

export type Palette = Record<Role, string>;

function normalizeSeed(seed: string): string {
  const m = seed.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) throw new ThemeError('Enter the seed as a hex colour, like #0F8A4A.');
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return `#${h.toUpperCase()}`;
}

export function palettes(o: Pick<ThemeOptions, 'seed' | 'variant' | 'contrast'>): { light: Palette; dark: Palette } {
  const seed = normalizeSeed(o.seed);
  const Make = MAKERS[o.variant];
  if (!Make) throw new ThemeError(`Unknown scheme variant: ${o.variant}`);
  const build = (dark: boolean) => {
    const scheme: DynamicScheme = new Make(Hct.fromInt(argbFromHex(seed)), dark, o.contrast);
    const colors = MaterialDynamicColors as unknown as Record<string, DynamicColor>;
    return Object.fromEntries([...ROLES, ...FIXED_ROLES].map((r) => [r, hexFromArgb(colors[r]!.getArgb(scheme)).toUpperCase()])) as Palette;
  };
  return { light: build(false), dark: build(true) };
}

const kotlinColor = (hex: string) => `Color(0xFF${hex.slice(1)})`;

export interface ThemeFiles {
  colorKt: string;
  themeKt: string;
  light: Palette;
  dark: Palette;
}

export function generateTheme(input: Partial<ThemeOptions> = {}): ThemeFiles {
  const o = { ...defaultThemeOptions, ...input };
  const pkg = o.packageName.trim();
  if (pkg && !/^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/.test(pkg)) throw new ThemeError(`"${pkg}" isn't a valid Kotlin package name.`);
  const name = o.themeName.replace(/[^A-Za-z0-9_]/g, '') || 'AppTheme';
  const { light, dark } = palettes(o);
  const roles: Role[] = [...ROLES, ...(o.fixedColors ? FIXED_ROLES : [])];
  const header = pkg ? `package ${pkg}\n\n` : '';

  const colorKt = `${header}import androidx.compose.ui.graphics.Color

// Generated from seed ${normalizeSeed(o.seed)} (${variants[o.variant].label}, contrast ${o.contrast}) on androidboss.info
${roles.map((r) => `val ${r}Light = ${kotlinColor(light[r])}`).join('\n')}

${roles.map((r) => `val ${r}Dark = ${kotlinColor(dark[r])}`).join('\n')}
`;

  const scheme = (fn: string, suffix: string) => `${fn}(\n${roles.map((r) => `    ${r} = ${r}${suffix},`).join('\n')}\n)`;
  const android = o.platform === 'android';
  const dynamic = android && o.dynamicColor;
  const imports = [
    dynamic && 'android.os.Build',
    'androidx.compose.foundation.isSystemInDarkTheme',
    'androidx.compose.material3.MaterialTheme',
    'androidx.compose.material3.darkColorScheme',
    dynamic && 'androidx.compose.material3.dynamicDarkColorScheme',
    dynamic && 'androidx.compose.material3.dynamicLightColorScheme',
    'androidx.compose.material3.lightColorScheme',
    'androidx.compose.runtime.Composable',
    dynamic && 'androidx.compose.ui.platform.LocalContext',
  ].filter(Boolean);

  const body = dynamic
    ? `@Composable
fun ${name}(
    darkTheme: Boolean = isSystemInDarkTheme(),
    // Wallpaper-based colours on Android 12+; your palette everywhere else.
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }
    MaterialTheme(colorScheme = colorScheme, content = content)
}`
    : `@Composable
fun ${name}(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme,
        content = content,
    )
}`;

  const themeKt = `${header}${imports.map((i) => `import ${i}`).join('\n')}

private val LightColorScheme = ${scheme('lightColorScheme', 'Light')}

private val DarkColorScheme = ${scheme('darkColorScheme', 'Dark')}

${body}
`;
  return { colorKt, themeKt, light, dark };
}
