import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, 'SettingsShortcut.svelte'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(root, '..', 'package.json'), 'utf8'));

test('settings shortcut exposes the shared settings route', () => {
  assert.match(source, /href = '#\/settings'/);
  assert.match(source, /data-testid="header-settings-link"/);
  assert.match(source, /i-lucide-settings/);
});

test('settings shortcut has a direct package export', () => {
  assert.deepEqual(packageJson.exports['./SettingsShortcut.svelte'], {
    svelte: './src/SettingsShortcut.svelte',
    default: './src/SettingsShortcut.svelte',
  });
});
