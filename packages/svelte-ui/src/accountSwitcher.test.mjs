import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const switcherSource = readFileSync(new URL('./AccountSwitcher.svelte', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('AccountSwitcher is exported as a shared Svelte UI component', () => {
  assert.deepEqual(packageJson.exports['./AccountSwitcher.svelte'], {
    svelte: './src/AccountSwitcher.svelte',
    default: './src/AccountSwitcher.svelte',
  });
});

test('AccountSwitcher keeps account UI generic and label driven', () => {
  assert.match(switcherSource, /interface AccountSwitcherAccount/);
  assert.match(switcherSource, /inputLabel = 'Add account'/);
  assert.match(switcherSource, /showAddForm = true/);
  assert.match(switcherSource, /\{#if showAddForm\}/);
  assert.match(switcherSource, /class="account-row"/);
  assert.match(switcherSource, /data-testid="account-item"/);
  assert.match(switcherSource, /imgProxy=\{false\}/);
  assert.match(switcherSource, /Current/);
  assert.doesNotMatch(switcherSource, /placeholder=/);
});
