import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import packageJson from '../package.json' with { type: 'json' };
import {
  userSettingsCapabilityLabels,
  userSettingsKeyLabel,
} from './userSettings.ts';

const panelSource = readFileSync(new URL('./UserSettingsPanel.svelte', import.meta.url), 'utf8');

test('UserSettingsPanel is exported as a shared Svelte UI component', () => {
  assert.deepEqual(packageJson.exports['./UserSettingsPanel.svelte'], {
    svelte: './src/UserSettingsPanel.svelte',
    default: './src/UserSettingsPanel.svelte',
  });
  assert.deepEqual(packageJson.exports['./userSettings'], {
    types: './src/userSettings.ts',
    default: './src/userSettings.ts',
  });
});

test('user settings panel exposes expected user management actions', () => {
  assert.match(panelSource, /user-settings-panel/);
  assert.match(panelSource, /user-add-device-toggle/);
  assert.match(panelSource, /user-approve-link/);
  assert.match(panelSource, /user-grant-admin/);
  assert.match(panelSource, /user-revoke-admin/);
  assert.match(panelSource, /user-remove-key/);
  assert.match(panelSource, /user-link-invite-qr/);
  assert.match(panelSource, /user-link-invite-loading/);
  assert.match(panelSource, /inviteQrUrl/);
  assert.match(panelSource, /showSummary/);
  assert.match(panelSource, /showDevicesHeading/);
  assert.match(panelSource, /showKeyBadges/);
  assert.match(panelSource, /Add Device/);
  assert.match(panelSource, /Copy link/);
  assert.match(panelSource, /Device requests/);
  assert.doesNotMatch(panelSource, /user-create-link/);
  assert.doesNotMatch(panelSource, /copy-value/);
  assert.doesNotMatch(panelSource, /Create invite/);
  assert.doesNotMatch(panelSource, /New invite/);
  assert.doesNotMatch(panelSource, /User keys/);
  assert.doesNotMatch(panelSource, /Linked keys/);
  assert.doesNotMatch(panelSource, /Current identity/);
  assert.doesNotMatch(panelSource, /shortUserKey/);
});

test('user settings helpers format key labels and capabilities', () => {
  assert.equal(userSettingsKeyLabel({ pubkey: 'a'.repeat(64), label: ' Laptop ' }), 'Laptop');
  assert.equal(userSettingsKeyLabel({ pubkey: 'a'.repeat(64), current: true }), 'This device');
  assert.equal(userSettingsKeyLabel({ pubkey: 'a'.repeat(64) }), 'Device');
  assert.deepEqual(userSettingsCapabilityLabels({
    can_admin_profile: true,
    can_write_roots: true,
    can_decrypt_key_epochs: true,
  }), ['Admin', 'Write', 'Decrypt']);
});
