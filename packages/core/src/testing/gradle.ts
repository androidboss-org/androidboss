import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** $GRADLE, or the newest Gradle in ~/.gradle/wrapper/dists. */
export function findGradle(): string | null {
  if (process.env.GRADLE && existsSync(process.env.GRADLE)) return process.env.GRADLE;
  const dists = join(homedir(), '.gradle/wrapper/dists');
  if (!existsSync(dists)) return null;
  const candidates = readdirSync(dists)
    .filter((d) => /^gradle-\d/.test(d))
    .flatMap((d) => readdirSync(join(dists, d)).map((h) => join(dists, d, h, d.replace(/-(bin|all)$/, ''), 'bin', 'gradle')))
    .filter(existsSync)
    .sort();
  return candidates.at(-1) ?? null;
}
