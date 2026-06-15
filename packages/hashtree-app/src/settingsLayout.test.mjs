import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'SettingsLayout.svelte'), 'utf8');

test('settings layout keeps shared top-level settings tabs', () => {
  for (const id of ['app', 'storage', 'traffic', 'servers', 'p2p']) {
    assert.match(source, new RegExp(`id: '${id}'`));
  }
  assert.doesNotMatch(source, /id: 'network'/);
  assert.doesNotMatch(source, /const networkSections/);
});

test('settings layout preserves legacy network route mappings', () => {
  assert.match(source, /path\.startsWith\('\/settings\/network\/traffic'\)/);
  assert.match(source, /path === '\/settings\/network'/);
  assert.match(source, /path\.startsWith\('\/settings\/network\/servers'\)/);
  assert.match(source, /path\.startsWith\('\/settings\/network\/p2p'\)/);
  assert.match(source, /navigate\(`\/settings\/\$\{id\}`\)/);
});
