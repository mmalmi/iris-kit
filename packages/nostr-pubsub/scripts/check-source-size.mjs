import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_SOURCE_LINES = 400;
const sourceDirectory = new URL('../src/', import.meta.url);
const files = (await readdir(sourceDirectory))
  .filter((file) => file.endsWith('.ts'))
  .sort();
const oversized = [];

for (const file of files) {
  const contents = await readFile(join(sourceDirectory.pathname, file), 'utf8');
  const lines = contents.split('\n').length;
  if (lines > MAX_SOURCE_LINES) oversized.push(`${file}: ${lines}`);
}

if (oversized.length > 0) {
  throw new Error(`TypeScript source files exceed ${MAX_SOURCE_LINES} lines:\n${oversized.join('\n')}`);
}
