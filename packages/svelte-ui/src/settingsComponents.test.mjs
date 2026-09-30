import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const indexSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const groupSource = readFileSync(new URL('./SettingsGroup.svelte', import.meta.url), 'utf8');
const itemSource = readFileSync(new URL('./SettingsGroupItem.svelte', import.meta.url), 'utf8');

test('exports reusable Iris settings group and row components', () => {
  assert.deepEqual(packageJson.exports['./SettingsGroup.svelte'], {
    svelte: './src/SettingsGroup.svelte',
    default: './src/SettingsGroup.svelte',
  });
  assert.deepEqual(packageJson.exports['./SettingsGroupItem.svelte'], {
    svelte: './src/SettingsGroupItem.svelte',
    default: './src/SettingsGroupItem.svelte',
  });
  assert.match(indexSource, /export \{ default as SettingsGroup \} from '\.\/SettingsGroup\.svelte';/);
  assert.match(indexSource, /export \{ default as SettingsGroupItem \} from '\.\/SettingsGroupItem\.svelte';/);
});

test('settings primitives carry the Iris Client group and row presentation', () => {
  assert.match(groupSource, /iris-settings-group-title/);
  assert.match(groupSource, /text-transform: uppercase/);
  assert.match(groupSource, /border-radius: 0\.75rem/);
  assert.match(itemSource, /variant === 'navigation'/);
  assert.match(itemSource, /iris-settings-group-item-active/);
  assert.match(itemSource, /left: 1rem/);
  assert.match(itemSource, /background: var\(--iris-settings-row-hover/);
  assert.match(itemSource, /\{#if href\}/);
  assert.match(itemSource, /\{:else if onclick\}/);
});
