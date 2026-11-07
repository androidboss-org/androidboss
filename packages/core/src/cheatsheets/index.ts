import { adb } from './adb.ts';
import { androidCli } from './android-cli.ts';
import { emulator } from './emulator.ts';
import { gradle } from './gradle.ts';
import { signing } from './signing.ts';
import { simctl } from './simctl.ts';
import type { Cheatsheet } from './types.ts';

export * from './types.ts';
export * from './fill.ts';

/** In the order the hub lists them. */
export const cheatsheets: readonly Cheatsheet[] = [adb, gradle, emulator, androidCli, signing, simctl];

export const cheatsheetBySlug = (slug: string) => cheatsheets.find((s) => s.slug === slug);

export const CHEATSHEET_SLUGS = cheatsheets.map((s) => s.slug) as [string, ...string[]];
