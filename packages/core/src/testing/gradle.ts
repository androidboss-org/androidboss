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
    .sort((a, b) => {
      // Numeric, so 9.10 sorts after 9.9.
      const v = (p: string) => (/gradle-([\d.]+)/.exec(p)?.[1] ?? '').split('.').map(Number);
      const [x, y] = [v(a), v(b)];
      for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
      return 0;
    });
  return candidates.at(-1) ?? null;
}
