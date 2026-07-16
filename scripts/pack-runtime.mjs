import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(process.argv[2] ?? join(root, 'dist-runtime'));
const packages = [
  { dir: 'ndk', build: true },
  { dir: 'ndk-cache', build: true },
  { dir: 'identity' },
  { dir: 'hashtree-app' },
  { dir: 'svelte-ui' },
  { dir: 'release-tools' },
];

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });

for (const entry of packages) {
  const cwd = join(root, 'packages', entry.dir);
  if (entry.build) execFileSync('pnpm', ['build'], { cwd, stdio: 'inherit' });
  const packed = JSON.parse(execFileSync(
    'pnpm',
    ['pack', '--json', '--pack-destination', destination],
    { cwd, encoding: 'utf8' },
  ));
  const manifest = JSON.parse(execFileSync(
    'tar',
    ['-xOf', packed.filename, 'package/package.json'],
    { encoding: 'utf8' },
  ));
  for (const [name, specifier] of Object.entries(manifest.dependencies ?? {})) {
    if (/^(?:file|link|workspace):/.test(specifier)) {
      throw new Error(`${manifest.name} packs a local dependency: ${name}=${specifier}`);
    }
  }
  process.stdout.write(`${JSON.stringify({
    name: manifest.name,
    version: manifest.version,
    filename: packed.filename,
  })}\n`);
}
