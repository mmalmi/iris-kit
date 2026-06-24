import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  IDENTITY_RECOVERY_METHODS,
  identityRecoveryRequestHasInput,
  normalizeIdentityRecoveryRequest,
} from './identityRecovery.ts';

const panelSource = readFileSync(new URL('./IdentityRecoveryPanel.svelte', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('IdentityRecoveryPanel is exported as a shared Svelte UI component', () => {
  assert.deepEqual(packageJson.exports['./IdentityRecoveryPanel.svelte'], {
    svelte: './src/IdentityRecoveryPanel.svelte',
    default: './src/IdentityRecoveryPanel.svelte',
  });
});

test('identity recovery methods cover supported recovery options', () => {
  assert.deepEqual(IDENTITY_RECOVERY_METHODS.map((method) => method.id), [
    'nip07',
    'seed_phrase',
    'nip46',
    'nsec',
  ]);
  assert.deepEqual(IDENTITY_RECOVERY_METHODS.map((method) => method.label), [
    'Browser extension',
    'Seed phrase',
    'Link device',
    'Secret key',
  ]);
  assert.ok(IDENTITY_RECOVERY_METHODS.some((method) => method.icon === 'i-lucide-key-round'));
  assert.ok(IDENTITY_RECOVERY_METHODS.some((method) => method.icon === 'i-lucide-link'));
  assert.match(panelSource, /IDENTITY_RECOVERY_METHODS/);
  assert.match(panelSource, /showCreateNew/);
  assert.match(panelSource, /onCreateNew/);
  assert.match(panelSource, /selected === 'nip07'/);
  assert.match(panelSource, /selected = null/);
});

test('identity recovery requests normalize credentials without long-lived signer state', () => {
  assert.deepEqual(normalizeIdentityRecoveryRequest({
    method: 'seed_phrase',
    seedWords: '  ABANDON   ABANDON  ',
    seedPassphrase: ' extra ',
  }), {
    method: 'seed_phrase',
    seedWords: 'abandon abandon',
    seedPassphrase: ' extra ',
  });
  assert.equal(identityRecoveryRequestHasInput({ method: 'nip07' }), true);
  assert.equal(identityRecoveryRequestHasInput({ method: 'nsec', nsec: '' }), false);
});
