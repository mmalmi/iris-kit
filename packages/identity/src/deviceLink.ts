import {
  APP_KEY_WRITER_CAPABILITIES,
  FACT_OP_KIND,
  NOSTR_IDENTITY_DEVICE_APPROVAL_BOOTSTRAP_PREFIX,
  NOSTR_IDENTITY_DEVICE_APPROVAL_RECEIPT_SCHEMA,
  NOSTR_IDENTITY_DEVICE_APPROVAL_RECEIPT_TYPE,
  createAddAppKeyRosterOp,
  normalizeHexPubkey,
  nostrIdentityDeviceApprovalClientNonce,
  nostrIdentityRosterOpMatchesDeviceApprovalReceipt,
  nostrIdentityRosterParentIds,
  npubToPubkey,
  parseNostrIdentityDeviceApprovalReceiptEvent as parseSharedNostrIdentityDeviceApprovalReceiptEvent,
  parseNostrIdentityDeviceApprovalReceiptRosterOp,
  parseNostrIdentityRosterOpEvent,
  pubkeyToNpub,
  type NostrIdentityCapabilities,
  type NostrIdentityDeviceApprovalReceipt,
  type NostrIdentityId,
  type NostrIdentityRosterOpContent,
  type SignedNostrIdentityRosterOp,
} from 'nostr-social-graph';
import { finalizeEvent, generateSecretKey, getPublicKey, nip44, type Event } from 'nostr-tools';

export * from 'nostr-social-graph';

export const DEVICE_APPROVAL_BOOTSTRAP_PREFIX = 'https://drive.iris.to/approve-device/';
export const NOSTR_IDENTITY_DEVICE_APPROVAL_BOOTSTRAP_MAX_URI_LENGTH = 384;
export const NOSTR_IDENTITY_DEVICE_APPROVAL_LABEL_MAX_BYTES = 16;

export interface DeviceApprovalBootstrap {
  deviceAppKeyNpub: string;
  requestNpub: string;
  requestSecret: string;
  label?: string;
}

export interface LocalDeviceApprovalBootstrap {
  bootstrap: DeviceApprovalBootstrap;
  requestSecretKey: Uint8Array;
}

export type DeviceApprovalReceipt = NostrIdentityDeviceApprovalReceipt;

const DEVICE_APPROVAL_BOOTSTRAP_FIELDS = new Set([
  'deviceAppKeyNpub',
  'requestNpub',
  'requestSecret',
  'label',
]);

export function createDeviceApprovalBootstrap(options: {
  deviceAppKeySecretKey: Uint8Array;
  requestSecretKey?: Uint8Array;
  requestSecret?: string;
  label?: string;
}): LocalDeviceApprovalBootstrap {
  const deviceAppKeyPubkey = getPublicKey(options.deviceAppKeySecretKey);
  const requestSecretKey = options.requestSecretKey ?? generateSecretKey();
  const requestPubkey = getPublicKey(requestSecretKey);
  if (deviceAppKeyPubkey === requestPubkey) {
    throw new Error('device approval stable and ephemeral keys must be distinct');
  }
  return {
    bootstrap: normalizeDeviceApprovalBootstrap({
      deviceAppKeyNpub: pubkeyToNpub(deviceAppKeyPubkey),
      requestNpub: pubkeyToNpub(requestPubkey),
      requestSecret: options.requestSecret ?? base64UrlEncode(generateSecretKey()),
      ...(options.label !== undefined ? { label: options.label } : {}),
    }),
    requestSecretKey,
  };
}

export function encodeDeviceApprovalBootstrap(bootstrap: DeviceApprovalBootstrap): string {
  const normalized = normalizeDeviceApprovalBootstrap(bootstrap);
  const uri = `${DEVICE_APPROVAL_BOOTSTRAP_PREFIX}${base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(normalized)),
  )}`;
  if (uri.length > NOSTR_IDENTITY_DEVICE_APPROVAL_BOOTSTRAP_MAX_URI_LENGTH) {
    throw new Error(
      `device approval bootstrap URI must not exceed ${NOSTR_IDENTITY_DEVICE_APPROVAL_BOOTSTRAP_MAX_URI_LENGTH} characters`,
    );
  }
  return uri;
}

export function parseDeviceApprovalBootstrap(input: string): DeviceApprovalBootstrap | null {
  const payload = strictBootstrapPayload(input);
  if (payload === null) return null;
  try {
    const bytes = base64UrlDecode(payload);
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    return normalizeDeviceApprovalBootstrap(value);
  } catch {
    return null;
  }
}

export function deviceApprovalBootstrapHasPrefix(input: string): boolean {
  return strictBootstrapPayload(input) !== null;
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

function normalizeDeviceApprovalBootstrap(value: unknown): DeviceApprovalBootstrap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('device approval bootstrap must be an object');
  }
  const record = value as Record<string, unknown>;
  const unknownField = Object.keys(record).find((field) => !DEVICE_APPROVAL_BOOTSTRAP_FIELDS.has(field));
  if (unknownField !== undefined) {
    throw new Error(`device approval bootstrap has unknown field ${unknownField}`);
  }
  const deviceAppKeyNpub = requireCanonicalNpub(record.deviceAppKeyNpub, 'device AppKey');
  const requestNpub = requireCanonicalNpub(record.requestNpub, 'request');
  if (deviceAppKeyNpub === requestNpub) {
    throw new Error('device approval stable and ephemeral keys must be distinct');
  }
  const label = normalizeDeviceApprovalLabel(record.label);
  return {
    deviceAppKeyNpub,
    requestNpub,
    requestSecret: requireRequestSecret(record.requestSecret),
    ...(label !== undefined ? { label } : {}),
  };
}

function strictBootstrapPayload(input: string): string | null {
  const value = input.trim();
  const prefix = [DEVICE_APPROVAL_BOOTSTRAP_PREFIX, NOSTR_IDENTITY_DEVICE_APPROVAL_BOOTSTRAP_PREFIX]
    .find((candidate) => value.startsWith(candidate));
  if (prefix === undefined) return null;
  const payload = value.slice(prefix.length);
  if (!payload || payload.includes('?') || payload.includes('#')) return null;
  return payload;
}

function normalizeDeviceApprovalLabel(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('device approval label must be a string');
  const label = value.trim();
  if (!label) return undefined;
  if (new TextEncoder().encode(label).length > NOSTR_IDENTITY_DEVICE_APPROVAL_LABEL_MAX_BYTES) {
    throw new Error(
      `device approval label exceeds ${NOSTR_IDENTITY_DEVICE_APPROVAL_LABEL_MAX_BYTES} UTF-8 bytes`,
    );
  }
  return label;
}

function requireCanonicalNpub(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a canonical npub`);
  const pubkey = npubToPubkey(value);
  if (!pubkey || pubkeyToNpub(pubkey) !== value) {
    throw new Error(`${label} must be a canonical npub`);
  }
  return value;
}

function requireRequestSecret(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error('device approval request secret must be canonical unpadded base64url');
  }
  const bytes = base64UrlDecode(value);
  if (bytes.length !== 32 || base64UrlEncode(bytes) !== value) {
    throw new Error('device approval request secret must encode exactly 32 bytes');
  }
  return value;
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

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) {
    throw new Error('invalid base64url');
  }
  const padded = `${value.replace(/-/gu, '+').replace(/_/gu, '/')}${'='.repeat((4 - value.length % 4) % 4)}`;
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (base64UrlEncode(bytes) !== value) throw new Error('noncanonical base64url');
  return bytes;
}
