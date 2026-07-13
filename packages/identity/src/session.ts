import { generateSecretKey, getPublicKey, nip19, type Event } from 'nostr-tools';
import {
  createDeviceApprovalBootstrap,
  encodeDeviceApprovalBootstrap,
  parseDeviceApprovalBootstrap,
  pubkeyToNpub,
  type DeviceApprovalBootstrap,
  type DeviceApprovalReceipt,
} from './deviceLink.ts';
import {
  APP_KEY_ADMIN_CAPABILITIES,
  type NostrIdentityId,
  type SignedNostrIdentityRosterOp,
} from './profile.ts';
import { projectNostrIdentityRoster } from './profileProjection.ts';
import { signNostrIdentityRosterOp } from './profileEvents.ts';
import { currentUnixSeconds, randomClientNonce } from './profileJson.ts';

export type NostrIdentitySessionStatus = 'active' | 'pending_device_approval';

interface NostrIdentitySessionBase {
  appKeyPubkey: string;
  appKeyNpub: string;
  appKeyNsec: string;
  rosterOps: SignedNostrIdentityRosterOp[];
  createdAt: number;
  label?: string;
}

export interface ActiveNostrIdentitySession extends NostrIdentitySessionBase {
  status: 'active';
  profileId: NostrIdentityId;
}

export interface PendingNostrIdentityDeviceApproval {
  bootstrap: DeviceApprovalBootstrap;
  requestNsec: string;
}

export interface PendingNostrIdentitySession extends NostrIdentitySessionBase {
  status: 'pending_device_approval';
  pendingDeviceApproval: PendingNostrIdentityDeviceApproval;
}

export type NostrIdentitySession = ActiveNostrIdentitySession | PendingNostrIdentitySession;

export interface StoredActiveNostrIdentitySession {
  schema: 2;
  profileId: NostrIdentityId;
  appKeyNsec: string;
  status: 'active';
  rosterOps: SignedNostrIdentityRosterOp[];
  createdAt: number;
  label?: string;
}

export interface StoredPendingNostrIdentitySession {
  schema: 2;
  appKeyNsec: string;
  status: 'pending_device_approval';
  createdAt: number;
  pendingDeviceApproval: PendingNostrIdentityDeviceApproval;
}

export type StoredNostrIdentitySession =
  | StoredActiveNostrIdentitySession
  | StoredPendingNostrIdentitySession;

export interface NostrIdentitySessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface NostrIdentitySessionStoreOptions {
  storage?: NostrIdentitySessionStorage | null;
  key?: string;
}

export type NostrIdentityEventPublisher = (event: Event) => Awaitable<void>;

type Awaitable<T> = T | Promise<T>;

export const DEFAULT_NOSTR_IDENTITY_SESSION_STORAGE_KEY = 'iris:nostr-identity-session:v2';

export function createLocalNostrIdentitySession(options: {
  profileId?: NostrIdentityId;
  appKeySecretKey?: Uint8Array;
  createdAt?: number;
  clientNonce?: string;
  label?: string;
} = {}): ActiveNostrIdentitySession {
  const appKeySecretKey = options.appKeySecretKey ?? generateSecretKey();
  const appKeyPubkey = getPublicKey(appKeySecretKey);
  const profileId = options.profileId ?? randomProfileId();
  const createdAt = options.createdAt ?? currentUnixSeconds();
  const label = options.label ?? 'This device';
  const bootstrap = signNostrIdentityRosterOp({
    signerSecretKey: appKeySecretKey,
    profileId,
    createdAt,
    clientNonce: options.clientNonce ?? randomClientNonce(),
    op: {
      op: 'add_facet',
      facet: {
        pubkey: appKeyPubkey,
        purposes: ['app_key'],
        capabilities: APP_KEY_ADMIN_CAPABILITIES,
        added_at: createdAt,
      },
    },
  });

  return {
    profileId,
    appKeyPubkey,
    appKeyNpub: nip19.npubEncode(appKeyPubkey),
    appKeyNsec: nip19.nsecEncode(appKeySecretKey),
    status: 'active',
    rosterOps: [bootstrap],
    createdAt,
    label,
  };
}

export function createPendingDeviceApprovalSession(options: {
  appKeySecretKey?: Uint8Array;
  requestSecretKey?: Uint8Array;
  createdAt?: number;
  label?: string;
} = {}): PendingNostrIdentitySession {
  const appKeySecretKey = options.appKeySecretKey ?? generateSecretKey();
  const appKeyPubkey = getPublicKey(appKeySecretKey);
  const createdAt = options.createdAt ?? currentUnixSeconds();
  const local = createDeviceApprovalBootstrap({
    deviceAppKeySecretKey: appKeySecretKey,
    ...(options.requestSecretKey !== undefined ? { requestSecretKey: options.requestSecretKey } : {}),
    ...(options.label !== undefined ? { label: options.label } : {}),
  });

  return {
    appKeyPubkey,
    appKeyNpub: nip19.npubEncode(appKeyPubkey),
    appKeyNsec: nip19.nsecEncode(appKeySecretKey),
    status: 'pending_device_approval',
    rosterOps: [],
    createdAt,
    ...(local.bootstrap.label !== undefined ? { label: local.bootstrap.label } : {}),
    pendingDeviceApproval: {
      bootstrap: local.bootstrap,
      requestNsec: nip19.nsecEncode(local.requestSecretKey),
    },
  };
}

export function completePendingDeviceApprovalSession(
  session: PendingNostrIdentitySession,
  options: {
    receipt: DeviceApprovalReceipt;
    rosterOps: SignedNostrIdentityRosterOp[];
  },
): ActiveNostrIdentitySession {
  const { bootstrap } = session.pendingDeviceApproval;
  if (pubkeyToNpub(options.receipt.requestPubkey) !== bootstrap.requestNpub) {
    throw new Error('device approval receipt request mismatch');
  }
  if (pubkeyToNpub(options.receipt.deviceAppKeyPubkey) !== session.appKeyNpub) {
    throw new Error('device approval receipt device mismatch');
  }
  if (options.receipt.requestSecret !== bootstrap.requestSecret) {
    throw new Error('device approval receipt secret mismatch');
  }
  if (
    options.receipt.rosterOpId !== undefined
    && !options.rosterOps.some((op) => op.op_id === options.receipt.rosterOpId)
  ) {
    throw new Error('device approval receipt roster op is missing');
  }
  const projection = projectNostrIdentityRoster(options.receipt.profileId, options.rosterOps);
  if (!projection.active_facets[session.appKeyPubkey]) {
    throw new Error('approved NostrIdentity AppKey is not active in its roster');
  }
  return {
    profileId: options.receipt.profileId,
    appKeyPubkey: session.appKeyPubkey,
    appKeyNpub: session.appKeyNpub,
    appKeyNsec: session.appKeyNsec,
    status: 'active',
    rosterOps: options.rosterOps,
    createdAt: session.createdAt,
    ...(session.label !== undefined ? { label: session.label } : {}),
  };
}

export function serializeNostrIdentitySession(session: NostrIdentitySession): StoredNostrIdentitySession {
  if (session.status === 'pending_device_approval') {
    return {
      schema: 2,
      appKeyNsec: session.appKeyNsec,
      status: session.status,
      createdAt: session.createdAt,
      pendingDeviceApproval: session.pendingDeviceApproval,
    };
  }
  return {
    schema: 2,
    profileId: session.profileId,
    appKeyNsec: session.appKeyNsec,
    status: session.status,
    rosterOps: session.rosterOps,
    createdAt: session.createdAt,
    ...(session.label ? { label: session.label } : {}),
  };
}

export function restoreNostrIdentitySession(stored: StoredNostrIdentitySession): NostrIdentitySession {
  const normalized = normalizeStoredNostrIdentitySession(stored);
  const appKeySecretKey = decodeNsec(normalized.appKeyNsec, 'stored NostrIdentity AppKey');
  const appKeyPubkey = getPublicKey(appKeySecretKey);
  const appKeyNpub = nip19.npubEncode(appKeyPubkey);

  if (normalized.status === 'pending_device_approval') {
    const bootstrap = normalizeBootstrap(normalized.pendingDeviceApproval.bootstrap);
    if (bootstrap.deviceAppKeyNpub !== appKeyNpub) {
      throw new Error('stored device approval bootstrap AppKey mismatch');
    }
    const requestSecretKey = decodeNsec(
      normalized.pendingDeviceApproval.requestNsec,
      'stored device approval request key',
    );
    if (nip19.npubEncode(getPublicKey(requestSecretKey)) !== bootstrap.requestNpub) {
      throw new Error('stored device approval request key mismatch');
    }
    return {
      appKeyPubkey,
      appKeyNpub,
      appKeyNsec: normalized.appKeyNsec,
      status: normalized.status,
      rosterOps: [],
      createdAt: normalized.createdAt,
      ...(bootstrap.label !== undefined ? { label: bootstrap.label } : {}),
      pendingDeviceApproval: {
        bootstrap,
        requestNsec: normalized.pendingDeviceApproval.requestNsec,
      },
    };
  }

  const projection = projectNostrIdentityRoster(normalized.profileId, normalized.rosterOps);
  if (!projection.active_facets[appKeyPubkey]) {
    throw new Error('stored NostrIdentity AppKey is not active in its roster');
  }
  return {
    profileId: normalized.profileId,
    appKeyPubkey,
    appKeyNpub,
    appKeyNsec: normalized.appKeyNsec,
    status: normalized.status,
    rosterOps: normalized.rosterOps,
    createdAt: normalized.createdAt,
    ...(normalized.label ? { label: normalized.label } : {}),
  };
}

export function loadNostrIdentitySession(
  options: NostrIdentitySessionStoreOptions = {},
): NostrIdentitySession | null {
  const storage = resolveSessionStorage(options.storage);
  if (!storage) return null;
  const raw = storage.getItem(options.key ?? DEFAULT_NOSTR_IDENTITY_SESSION_STORAGE_KEY);
  if (!raw) return null;
  return restoreNostrIdentitySession(parseStoredNostrIdentitySession(raw));
}

export function saveNostrIdentitySession(
  session: NostrIdentitySession,
  options: NostrIdentitySessionStoreOptions = {},
): void {
  const storage = resolveSessionStorage(options.storage);
  if (!storage) throw new Error('NostrIdentity session storage is unavailable');
  storage.setItem(
    options.key ?? DEFAULT_NOSTR_IDENTITY_SESSION_STORAGE_KEY,
    JSON.stringify(serializeNostrIdentitySession(session)),
  );
}

export function clearNostrIdentitySession(options: NostrIdentitySessionStoreOptions = {}): void {
  const storage = resolveSessionStorage(options.storage);
  storage?.removeItem(options.key ?? DEFAULT_NOSTR_IDENTITY_SESSION_STORAGE_KEY);
}

export function parseStoredNostrIdentitySession(raw: string): StoredNostrIdentitySession {
  return normalizeStoredNostrIdentitySession(JSON.parse(raw) as unknown);
}

export function nostrIdentitySessionRosterEvents(session: NostrIdentitySession): Event[] {
  return session.rosterOps.map((op) => JSON.parse(op.event_json) as Event);
}

export async function publishNostrIdentitySessionRosterEvents(
  session: NostrIdentitySession,
  publish: NostrIdentityEventPublisher,
): Promise<void> {
  for (const event of nostrIdentitySessionRosterEvents(session)) {
    await publish(event);
  }
}

function normalizeStoredNostrIdentitySession(value: unknown): StoredNostrIdentitySession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('stored NostrIdentity session must be an object');
  }
  const stored = value as Record<string, unknown>;
  if (stored.schema !== 2) throw new Error('unsupported NostrIdentity session schema');
  if (stored.status === 'active') {
    requireExactFields(stored, [
      'schema', 'profileId', 'appKeyNsec', 'status', 'rosterOps', 'createdAt', 'label',
    ], 'stored active NostrIdentity session');
    if (typeof stored.profileId !== 'string') throw new Error('stored NostrIdentity session missing profile id');
    if (typeof stored.appKeyNsec !== 'string') throw new Error('stored NostrIdentity session missing AppKey secret');
    if (!Array.isArray(stored.rosterOps)) throw new Error('stored NostrIdentity session missing roster ops');
    if (!Number.isInteger(stored.createdAt)) throw new Error('stored NostrIdentity session missing created timestamp');
    if (stored.label !== undefined && typeof stored.label !== 'string') {
      throw new Error('stored NostrIdentity session label must be a string');
    }
    return stored as unknown as StoredActiveNostrIdentitySession;
  }
  if (stored.status === 'pending_device_approval') {
    requireExactFields(stored, [
      'schema', 'appKeyNsec', 'status', 'createdAt', 'pendingDeviceApproval',
    ], 'stored pending NostrIdentity session');
    if (typeof stored.appKeyNsec !== 'string') throw new Error('stored NostrIdentity session missing AppKey secret');
    if (!Number.isInteger(stored.createdAt)) throw new Error('stored NostrIdentity session missing created timestamp');
    if (!stored.pendingDeviceApproval || typeof stored.pendingDeviceApproval !== 'object'
      || Array.isArray(stored.pendingDeviceApproval)) {
      throw new Error('stored NostrIdentity session missing device approval');
    }
    const pending = stored.pendingDeviceApproval as Record<string, unknown>;
    requireExactFields(pending, ['bootstrap', 'requestNsec'], 'stored device approval');
    if (typeof pending.requestNsec !== 'string') throw new Error('stored device approval missing request key');
    normalizeBootstrap(pending.bootstrap);
    return stored as unknown as StoredPendingNostrIdentitySession;
  }
  throw new Error('stored NostrIdentity session has invalid status');
}

function normalizeBootstrap(value: unknown): DeviceApprovalBootstrap {
  const encoded = encodeDeviceApprovalBootstrap(value as DeviceApprovalBootstrap);
  const bootstrap = parseDeviceApprovalBootstrap(encoded);
  if (!bootstrap) throw new Error('invalid device approval bootstrap');
  return bootstrap;
}

function decodeNsec(value: string, label: string): Uint8Array {
  const decoded = nip19.decode(value);
  if (decoded.type !== 'nsec') throw new Error(`${label} is not an nsec`);
  return decoded.data as Uint8Array;
}

function requireExactFields(value: Record<string, unknown>, fields: string[], label: string): void {
  const allowed = new Set(fields);
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown !== undefined) throw new Error(`${label} has unknown field ${unknown}`);
}

function resolveSessionStorage(
  storage: NostrIdentitySessionStorage | null | undefined,
): NostrIdentitySessionStorage | null {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function randomProfileId(): NostrIdentityId {
  return globalThis.crypto?.randomUUID?.() ?? fallbackUuidV4();
}

function fallbackUuidV4(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  if (!bytes.some(Boolean)) {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
