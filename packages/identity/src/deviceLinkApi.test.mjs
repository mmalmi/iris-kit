import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  encodeNostrIdentityDeviceApprovalBootstrap,
  parseNostrIdentityDeviceApprovalBootstrap,
} from 'nostr-social-graph';
import { generateSecretKey } from 'nostr-tools';

const DEVICE_LINK_EXPORTS = [
  'DEVICE_APPROVAL_BOOTSTRAP_PREFIX',
  'NOSTR_IDENTITY_DEVICE_APPROVAL_BOOTSTRAP_MAX_URI_LENGTH',
  'NOSTR_IDENTITY_DEVICE_APPROVAL_LABEL_MAX_BYTES',
  'NOSTR_IDENTITY_DEVICE_APPROVAL_RECEIPT_SCHEMA',
  'NOSTR_IDENTITY_DEVICE_APPROVAL_RECEIPT_TYPE',
  'approveDeviceApprovalBootstrap',
  'buildDeviceApprovalReceiptEvent',
  'createDeviceApprovalBootstrap',
  'deviceApprovalBootstrapHasPrefix',
  'encodeDeviceApprovalBootstrap',
  'isCompleteDeviceApprovalBootstrapInput',
  'npubToPubkey',
  'parseDeviceApprovalBootstrap',
  'parseDeviceApprovalReceiptEvent',
  'parseDeviceApprovalReceiptRosterOp',
  'pubkeyToNpub',
  'rosterOpMatchesDeviceApprovalReceipt',
];

test('deviceLink exposes only the request-event-free approval API', async () => {
  const deviceLink = await import('./deviceLink.ts');
  const source = await readFile(new URL('./deviceLink.ts', import.meta.url), 'utf8');

  assert.deepEqual(Object.keys(deviceLink).sort(), DEVICE_LINK_EXPORTS.sort());
  assert.doesNotMatch(source, /export\s+\*\s+from\s+['"]nostr-social-graph['"]/u);
  assert.doesNotMatch(source, /function\s+base64Url|\batob\b|\bbtoa\b/u);
  assert.match(source, /createNostrIdentityDeviceApprovalBootstrap/u);
  assert.match(source, /encodeNostrIdentityDeviceApprovalBootstrap/u);
  assert.match(source, /parseNostrIdentityDeviceApprovalBootstrap/u);
});

test('deviceLink delegates bootstrap encoding and parsing to nostr-social-graph', async () => {
  const deviceLink = await import('./deviceLink.ts');
  const { bootstrap } = deviceLink.createDeviceApprovalBootstrap({
    deviceAppKeySecretKey: generateSecretKey(),
    label: ' Phone ',
  });
  const encoded = deviceLink.encodeDeviceApprovalBootstrap(bootstrap);
  const canonicalEncoded = encodeNostrIdentityDeviceApprovalBootstrap(bootstrap, {
    prefix: deviceLink.DEVICE_APPROVAL_BOOTSTRAP_PREFIX,
  });

  assert.equal(encoded, canonicalEncoded);
  assert.deepEqual(
    deviceLink.parseDeviceApprovalBootstrap(encoded),
    parseNostrIdentityDeviceApprovalBootstrap(encoded, {
      prefixes: [deviceLink.DEVICE_APPROVAL_BOOTSTRAP_PREFIX],
    }),
  );
  assert.equal(bootstrap.label, 'Phone');
});
