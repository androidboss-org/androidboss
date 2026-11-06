/**
 * Bundles the CLI into one dependency-free file, dist/androidboss.mjs, so
 * `npx androidboss` installs nothing else. The licences of everything bundled
 * go to dist/THIRD-PARTY-LICENSES.txt.
 */
import { build } from 'esbuild';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, '..');
const root = join(pkgDir, '..', '..');
const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));

rmSync(join(pkgDir, 'dist'), { recursive: true, force: true });
const result = await build({
  entryPoints: [join(pkgDir, 'src/main.ts')],
  outfile: join(pkgDir, 'dist/androidboss.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  minifySyntax: true,
  minifyWhitespace: true,
  legalComments: 'none',
  metafile: true,
  absWorkingDir: root, // metafile paths are relative to the repo root
  define: { __VERSION__: JSON.stringify(version) },
  // CommonJS dependencies inside an ES module bundle need a require().
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});

// Every npm package that ended up in the bundle, with its licence text.
const packages = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  const m = input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//g);
  if (!m) continue;
  const dir = join(root, input.slice(0, input.lastIndexOf(m.at(-1)) + m.at(-1).length));
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  if (!packages.has(manifest.name)) packages.set(manifest.name, { dir, manifest });
}
const notices = [...packages.values()]
  .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
  .map(({ dir, manifest }) => {
    const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
    const text = file ? readFileSync(join(dir, file), 'utf8').trim() : `Licensed under ${manifest.license}.`;
    return `${manifest.name}@${manifest.version} (${manifest.license})\n${'-'.repeat(60)}\n${text}`;
  });
writeFileSync(
  join(pkgDir, 'dist/THIRD-PARTY-LICENSES.txt'),
  `androidboss ${version} bundles the following packages.\n\n${notices.join('\n\n\n')}\n`,
);

const size = readFileSync(join(pkgDir, 'dist/androidboss.mjs')).length;
console.log(`dist/androidboss.mjs ${(size / 1024).toFixed(0)} KB, ${packages.size} bundled packages: ${[...packages.keys()].join(', ')}`);
if (!existsSync(join(pkgDir, 'dist/androidboss.mjs'))) process.exit(1);
