import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import packageJson from '../package.json' with { type: 'json' };
import {
  identitySettingsCapabilityLabels,
  identitySettingsKeyLabel,
  shortIdentityKey,
} from './identitySettings.ts';

const panelSource = readFileSync(new URL('./IdentitySettingsPanel.svelte', import.meta.url), 'utf8');

test('IdentitySettingsPanel is exported as a shared Svelte UI component', () => {
  assert.deepEqual(packageJson.exports['./IdentitySettingsPanel.svelte'], {
    svelte: './src/IdentitySettingsPanel.svelte',
    default: './src/IdentitySettingsPanel.svelte',
  });
  assert.deepEqual(packageJson.exports['./identitySettings'], {
    types: './src/identitySettings.ts',
    default: './src/identitySettings.ts',
  });
});

test('identity settings panel exposes expected identity management actions', () => {
  assert.match(panelSource, /identity-settings-panel/);
  assert.match(panelSource, /identity-create-link/);
  assert.match(panelSource, /identity-approve-link/);
  assert.match(panelSource, /identity-grant-admin/);
  assert.match(panelSource, /identity-revoke-admin/);
  assert.match(panelSource, /identity-remove-key/);
});

test('identity settings helpers format key labels and capabilities', () => {
  assert.equal(identitySettingsKeyLabel({ pubkey: 'a'.repeat(64), label: ' Laptop ' }), 'Laptop');
  assert.equal(shortIdentityKey('a'.repeat(64)), 'aaaaaaaa...aaaaaa');
  assert.deepEqual(identitySettingsCapabilityLabels({
    can_admin_profile: true,
    can_write_roots: true,
    can_decrypt_key_epochs: true,
  }), ['Admin', 'Write', 'Decrypt']);
});
