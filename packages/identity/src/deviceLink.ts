import {
  APP_KEY_WRITER_CAPABILITIES,
  FACT_OP_KIND,
  NOSTR_IDENTITY_DEVICE_APPROVAL_BOOTSTRAP_MAX_URI_LENGTH as SHARED_DEVICE_APPROVAL_BOOTSTRAP_MAX_URI_LENGTH,
  NOSTR_IDENTITY_DEVICE_APPROVAL_LABEL_MAX_BYTES as SHARED_DEVICE_APPROVAL_LABEL_MAX_BYTES,
  NOSTR_IDENTITY_DEVICE_APPROVAL_RECEIPT_SCHEMA,
  NOSTR_IDENTITY_DEVICE_APPROVAL_RECEIPT_TYPE,
  createAddAppKeyRosterOp,
  createNostrIdentityDeviceApprovalBootstrap,
  encodeNostrIdentityDeviceApprovalBootstrap,
  normalizeHexPubkey,
  nostrIdentityDeviceApprovalBootstrapHasPrefix,
  nostrIdentityDeviceApprovalClientNonce,
  nostrIdentityRosterOpMatchesDeviceApprovalReceipt,
  nostrIdentityRosterParentIds,
  npubToPubkey,
  parseNostrIdentityDeviceApprovalBootstrap,
  parseNostrIdentityDeviceApprovalReceiptEvent as parseSharedNostrIdentityDeviceApprovalReceiptEvent,
  parseNostrIdentityDeviceApprovalReceiptRosterOp,
  parseNostrIdentityRosterOpEvent,
  pubkeyToNpub,
  randomNostrIdentityDeviceApprovalSecret,
  type NostrIdentityCapabilities,
  type NostrIdentityDeviceApprovalBootstrap,
  type NostrIdentityDeviceApprovalReceipt,
  type NostrIdentityId,
  type NostrIdentityRosterOpContent,
  type SignedNostrIdentityRosterOp,
} from 'nostr-social-graph';
import { finalizeEvent, generateSecretKey, getPublicKey, nip44, type Event } from 'nostr-tools';

export const DEVICE_APPROVAL_BOOTSTRAP_PREFIX = 'https://drive.iris.to/approve-device/';
export const NOSTR_IDENTITY_DEVICE_APPROVAL_BOOTSTRAP_MAX_URI_LENGTH =
  SHARED_DEVICE_APPROVAL_BOOTSTRAP_MAX_URI_LENGTH;
export const NOSTR_IDENTITY_DEVICE_APPROVAL_LABEL_MAX_BYTES =
  SHARED_DEVICE_APPROVAL_LABEL_MAX_BYTES;
export {
  NOSTR_IDENTITY_DEVICE_APPROVAL_RECEIPT_SCHEMA,
  NOSTR_IDENTITY_DEVICE_APPROVAL_RECEIPT_TYPE,
};

export type DeviceApprovalBootstrap = NostrIdentityDeviceApprovalBootstrap;

export interface LocalDeviceApprovalBootstrap {
  bootstrap: DeviceApprovalBootstrap;
  requestSecretKey: Uint8Array;
}

export type DeviceApprovalReceipt = NostrIdentityDeviceApprovalReceipt;

const DEVICE_APPROVAL_BOOTSTRAP_OPTION_FIELDS = new Set([
  'deviceAppKeySecretKey',
  'requestSecretKey',
  'label',
]);

export function createDeviceApprovalBootstrap(options: {
  deviceAppKeySecretKey: Uint8Array;
  requestSecretKey?: Uint8Array;
  label?: string;
}): LocalDeviceApprovalBootstrap {
  const unknownOption = Object.keys(options)
    .find((field) => !DEVICE_APPROVAL_BOOTSTRAP_OPTION_FIELDS.has(field));
  if (unknownOption !== undefined) {
    throw new Error(`device approval bootstrap has unknown option ${unknownOption}`);
  }
  const deviceAppKeyPubkey = getPublicKey(options.deviceAppKeySecretKey);
  const requestSecretKey = options.requestSecretKey ?? generateSecretKey();
  const requestPubkey = getPublicKey(requestSecretKey);
  return {
    bootstrap: createNostrIdentityDeviceApprovalBootstrap({
      deviceAppKeyPubkey,
      requestPubkey,
      requestSecret: randomNostrIdentityDeviceApprovalSecret(),
      ...(options.label !== undefined ? { label: options.label } : {}),
    }),
    requestSecretKey,
  };
}

export function encodeDeviceApprovalBootstrap(bootstrap: DeviceApprovalBootstrap): string {
  return encodeNostrIdentityDeviceApprovalBootstrap(bootstrap, {
    prefix: DEVICE_APPROVAL_BOOTSTRAP_PREFIX,
  });
}

export function parseDeviceApprovalBootstrap(input: string): DeviceApprovalBootstrap | null {
  if (!input.startsWith(DEVICE_APPROVAL_BOOTSTRAP_PREFIX)) return null;
  return parseNostrIdentityDeviceApprovalBootstrap(input, {
    prefixes: [DEVICE_APPROVAL_BOOTSTRAP_PREFIX],
  });
}

export function deviceApprovalBootstrapHasPrefix(input: string): boolean {
  return input.startsWith(DEVICE_APPROVAL_BOOTSTRAP_PREFIX)
    && nostrIdentityDeviceApprovalBootstrapHasPrefix(input, {
      prefixes: [DEVICE_APPROVAL_BOOTSTRAP_PREFIX],
    });
}

export function isCompleteDeviceApprovalBootstrapInput(input: string): boolean {
  return parseDeviceApprovalBootstrap(input) !== null;
}

export function approveDeviceApprovalBootstrap(options: {
  bootstrap: DeviceApprovalBootstrap;
  profileId: NostrIdentityId;
  rosterOps: SignedNostrIdentityRosterOp[];
  approvedByPubkey: string;
  approvedAt: number;
  clientNonce?: string;
  capabilities?: NostrIdentityCapabilities;
}): NostrIdentityRosterOpContent {
  const bootstrap = normalizeDeviceApprovalBootstrap(options.bootstrap);
  return createAddAppKeyRosterOp({
    profileId: options.profileId,
    actorPubkey: requirePubkey(options.approvedByPubkey, 'approving AppKey'),
    devicePubkey: npubToPubkey(bootstrap.deviceAppKeyNpub)!,
    createdAt: requireInteger(options.approvedAt, 'approvedAt'),
    clientNonce: options.clientNonce ?? nostrIdentityDeviceApprovalClientNonce(),
    parents: nostrIdentityRosterParentIds(options.rosterOps),
    capabilities: options.capabilities ?? APP_KEY_WRITER_CAPABILITIES,
  });
}

export function buildDeviceApprovalReceiptEvent(options: {
  signerSecretKey: Uint8Array;
  bootstrap: DeviceApprovalBootstrap;
  profileId: NostrIdentityId;
  approvedAt: number;
  subjectPubkey?: string;
  rosterOpId?: string;
  rosterOpEvent?: Event | SignedNostrIdentityRosterOp;
}): Event {
  const bootstrap = normalizeDeviceApprovalBootstrap(options.bootstrap);
  const approvedByPubkey = getPublicKey(options.signerSecretKey);
  const profileId = requireProfileId(options.profileId);
  const signedRosterEvent = options.rosterOpEvent === undefined
    ? undefined
    : 'event_json' in options.rosterOpEvent
      ? options.rosterOpEvent.event_json
      : JSON.stringify(options.rosterOpEvent);
  const signedRosterOp = signedRosterEvent === undefined
    ? undefined
    : parseNostrIdentityRosterOpEvent(JSON.parse(signedRosterEvent) as Event);
  const rosterOpId = options.rosterOpId ?? signedRosterOp?.op_id;
  const receipt: DeviceApprovalReceipt = {
    schema: NOSTR_IDENTITY_DEVICE_APPROVAL_RECEIPT_SCHEMA,
    profileId,
    requestPubkey: npubToPubkey(bootstrap.requestNpub)!,
    deviceAppKeyPubkey: npubToPubkey(bootstrap.deviceAppKeyNpub)!,
    approvedByPubkey,
    approvedAt: requireInteger(options.approvedAt, 'approvedAt'),
    requestSecret: bootstrap.requestSecret,
    ...(options.subjectPubkey !== undefined
      ? { subjectPubkey: requirePubkey(options.subjectPubkey, 'subject') }
      : {}),
    ...(rosterOpId !== undefined ? { rosterOpId: requireEventId(rosterOpId) } : {}),
    ...(signedRosterEvent !== undefined ? { signedRosterEvent } : {}),
  };
  if (signedRosterOp !== undefined) assertReceiptRosterOpMatches(receipt, signedRosterOp);

  const conversationKey = nip44.v2.utils.getConversationKey(
    options.signerSecretKey,
    receipt.requestPubkey,
  );
  return finalizeEvent({
    kind: FACT_OP_KIND,
    content: nip44.v2.encrypt(JSON.stringify(receipt), conversationKey),
    created_at: receipt.approvedAt,
    tags: [
      ['type', NOSTR_IDENTITY_DEVICE_APPROVAL_RECEIPT_TYPE],
      ['p', receipt.requestPubkey],
      ['i', receipt.profileId, 'subject'],
    ],
  }, options.signerSecretKey);
}

export function parseDeviceApprovalReceiptEvent(
  event: Event,
  options: {
    requestSecretKey: Uint8Array;
    bootstrap: DeviceApprovalBootstrap;
    profileId?: NostrIdentityId;
    approvedByPubkey?: string;
  },
): DeviceApprovalReceipt {
  const bootstrap = normalizeDeviceApprovalBootstrap(options.bootstrap);
  if (pubkeyToNpub(getPublicKey(options.requestSecretKey)) !== bootstrap.requestNpub) {
    throw new Error('device approval receipt request mismatch');
  }
  const receipt = parseSharedNostrIdentityDeviceApprovalReceiptEvent(event, {
    requestSecretKey: options.requestSecretKey,
    ...(options.profileId !== undefined ? { profileId: options.profileId } : {}),
    ...(options.approvedByPubkey !== undefined
      ? { approvedByPubkey: options.approvedByPubkey }
      : {}),
  });
  if (receipt.requestSecret !== bootstrap.requestSecret) {
    throw new Error('device approval receipt secret mismatch');
  }
  if (pubkeyToNpub(receipt.deviceAppKeyPubkey) !== bootstrap.deviceAppKeyNpub) {
    throw new Error('device approval receipt device mismatch');
  }
  return receipt;
}

export const parseDeviceApprovalReceiptRosterOp = parseNostrIdentityDeviceApprovalReceiptRosterOp;
export const rosterOpMatchesDeviceApprovalReceipt = nostrIdentityRosterOpMatchesDeviceApprovalReceipt;
export { npubToPubkey, pubkeyToNpub };

function normalizeDeviceApprovalBootstrap(
  bootstrap: DeviceApprovalBootstrap,
): DeviceApprovalBootstrap {
  const normalized = parseDeviceApprovalBootstrap(encodeDeviceApprovalBootstrap(bootstrap));
  if (normalized === null) throw new Error('invalid device approval bootstrap');
  return normalized;
}

function requirePubkey(value: string, label: string): string {
  const pubkey = normalizeHexPubkey(value);
  if (!pubkey) throw new Error(`${label} pubkey must be 64-char hex`);
  return pubkey;
}

function requireProfileId(value: NostrIdentityId): NostrIdentityId {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new Error('profileId must be a UUID');
  }
  return value;
}

function requireEventId(value: string): string {
  if (!/^[0-9a-f]{64}$/u.test(value)) throw new Error('roster op id must be 64-char hex');
  return value;
}

function requireInteger(value: number, label: string): number {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer`);
  return value;
}

function assertReceiptRosterOpMatches(
  receipt: DeviceApprovalReceipt,
  op: SignedNostrIdentityRosterOp,
): void {
  if (op.op_id !== receipt.rosterOpId) throw new Error('device approval receipt roster op id mismatch');
  if (op.content.profile_id !== receipt.profileId) {
    throw new Error('device approval receipt roster profile mismatch');
  }
  if (op.signer_pubkey !== receipt.approvedByPubkey) {
    throw new Error('device approval receipt roster signer mismatch');
  }
  if (!rosterOpMatchesDeviceApprovalReceipt(op, receipt)) {
    throw new Error('device approval receipt roster device mismatch');
  }
}
