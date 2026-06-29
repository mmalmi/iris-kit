import { generateSecretKey, getPublicKey, nip19, type Event } from 'nostr-tools';
import {
  createDeviceLinkRequest,
  parseDeviceLinkInvite,
  type DeviceLinkInvite,
  type DeviceLinkRequest,
} from './deviceLink.ts';
import {
  APP_KEY_ADMIN_CAPABILITIES,
  type NostrIdentityId,
  type SignedNostrIdentityRosterOp,
} from './profile.ts';
import { projectNostrIdentityRoster } from './profileProjection.ts';
import { signNostrIdentityRosterOp } from './profileEvents.ts';

export type NostrIdentitySessionStatus = 'active' | 'pending_device_link';

export interface NostrIdentitySession {
  profileId: NostrIdentityId;
  appKeyPubkey: string;
  appKeyNpub: string;
  appKeyNsec: string;
  status: NostrIdentitySessionStatus;
  rosterOps: SignedNostrIdentityRosterOp[];
  createdAt: number;
  label?: string;
  pendingDeviceLink?: DeviceLinkRequest;
}

export interface StoredNostrIdentitySession {
  schema: 1;
  profileId: NostrIdentityId;
  appKeyNsec: string;
  status: NostrIdentitySessionStatus;
  rosterOps: SignedNostrIdentityRosterOp[];
  createdAt: number;
  label?: string;
  pendingDeviceLink?: DeviceLinkRequest;
}

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

export type Awaitable<T> = T | Promise<T>;

export const DEFAULT_NOSTR_IDENTITY_SESSION_STORAGE_KEY = 'iris:nostr-identity-session:v1';

export function createLocalNostrIdentitySession(options: {
  profileId?: NostrIdentityId;
  appKeySecretKey?: Uint8Array;
  createdAt?: number;
  clientNonce?: string;
  label?: string;
} = {}): NostrIdentitySession {
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

export function createPendingDeviceLinkSession(options: {
  invite: DeviceLinkInvite | string;
  appKeySecretKey?: Uint8Array;
  requestedAt?: number;
  label?: string;
}): NostrIdentitySession {
  const invite = typeof options.invite === 'string' ? parseDeviceLinkInvite(options.invite) : options.invite;
  if (!invite) throw new Error('invalid device-link invite');
  const appKeySecretKey = options.appKeySecretKey ?? generateSecretKey();
  const appKeyPubkey = getPublicKey(appKeySecretKey);
  const requestedAt = options.requestedAt ?? currentUnixSeconds();
  const request = createDeviceLinkRequest({
    invite,
    deviceAppKeyPubkey: appKeyPubkey,
    requestedAt,
    label: options.label,
  });

  return {
    profileId: invite.profileId,
    appKeyPubkey,
    appKeyNpub: nip19.npubEncode(appKeyPubkey),
    appKeyNsec: nip19.nsecEncode(appKeySecretKey),
    status: 'pending_device_link',
    rosterOps: [],
    createdAt: requestedAt,
    ...(options.label?.trim() ? { label: options.label.trim() } : {}),
    pendingDeviceLink: request,
  };
}

export function serializeNostrIdentitySession(session: NostrIdentitySession): StoredNostrIdentitySession {
  return {
    schema: 1,
    profileId: session.profileId,
    appKeyNsec: session.appKeyNsec,
    status: session.status,
    rosterOps: session.rosterOps,
    createdAt: session.createdAt,
    ...(session.label ? { label: session.label } : {}),
    ...(session.pendingDeviceLink ? { pendingDeviceLink: session.pendingDeviceLink } : {}),
  };
}

export function restoreNostrIdentitySession(stored: StoredNostrIdentitySession): NostrIdentitySession {
  if (stored.schema !== 1) throw new Error(`unsupported NostrIdentity session schema ${stored.schema}`);
  const decoded = nip19.decode(stored.appKeyNsec);
  if (decoded.type !== 'nsec') throw new Error('stored NostrIdentity AppKey is not an nsec');
  const secretKey = decoded.data as Uint8Array;
  const appKeyPubkey = getPublicKey(secretKey);
  if (stored.status === 'active') {
    const projection = projectNostrIdentityRoster(stored.profileId, stored.rosterOps);
    if (!projection.active_facets[appKeyPubkey]) {
      throw new Error('stored NostrIdentity AppKey is not active in its roster');
    }
  }
  return {
    profileId: stored.profileId,
    appKeyPubkey,
    appKeyNpub: nip19.npubEncode(appKeyPubkey),
    appKeyNsec: stored.appKeyNsec,
    status: stored.status,
    rosterOps: stored.rosterOps,
    createdAt: stored.createdAt,
    ...(stored.label ? { label: stored.label } : {}),
    ...(stored.pendingDeviceLink ? { pendingDeviceLink: stored.pendingDeviceLink } : {}),
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
  const parsed = JSON.parse(raw) as Partial<StoredNostrIdentitySession>;
  if (!parsed || parsed.schema !== 1) throw new Error('unsupported NostrIdentity session schema');
  if (typeof parsed.profileId !== 'string') throw new Error('stored NostrIdentity session missing profile id');
  if (typeof parsed.appKeyNsec !== 'string') throw new Error('stored NostrIdentity session missing AppKey secret');
  if (parsed.status !== 'active' && parsed.status !== 'pending_device_link') {
    throw new Error('stored NostrIdentity session has invalid status');
  }
  if (!Array.isArray(parsed.rosterOps)) throw new Error('stored NostrIdentity session missing roster ops');
  if (typeof parsed.createdAt !== 'number') throw new Error('stored NostrIdentity session missing created timestamp');
  return parsed as StoredNostrIdentitySession;
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

function currentUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function randomClientNonce(): string {
  return globalThis.crypto?.randomUUID?.() ?? `nonce-${Math.random().toString(36).slice(2)}`;
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
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
