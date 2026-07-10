import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

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
});
