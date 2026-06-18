import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import {
  createDeviceLinkRequest,
  parseDeviceLinkInvite,
  type DeviceLinkInvite,
  type DeviceLinkRequest,
} from './deviceLink.ts';
import {
  APP_KEY_ADMIN_CAPABILITIES,
  type IrisProfileId,
  type SignedIrisProfileRosterOp,
} from './profile.ts';
import { projectIrisProfileRoster } from './profileProjection.ts';
import { signIrisProfileRosterOp } from './profileEvents.ts';

export type IrisIdentitySessionStatus = 'active' | 'pending_device_link';

export interface IrisIdentitySession {
  profileId: IrisProfileId;
  appKeyPubkey: string;
  appKeyNpub: string;
  appKeyNsec: string;
  status: IrisIdentitySessionStatus;
  rosterOps: SignedIrisProfileRosterOp[];
  createdAt: number;
  label?: string;
  pendingDeviceLink?: DeviceLinkRequest;
}

export interface StoredIrisIdentitySession {
  schema: 1;
  profileId: IrisProfileId;
  appKeyNsec: string;
  status: IrisIdentitySessionStatus;
  rosterOps: SignedIrisProfileRosterOp[];
  createdAt: number;
  label?: string;
  pendingDeviceLink?: DeviceLinkRequest;
}

export function createLocalIrisIdentitySession(options: {
  profileId?: IrisProfileId;
  appKeySecretKey?: Uint8Array;
  createdAt?: number;
  clientNonce?: string;
  label?: string;
} = {}): IrisIdentitySession {
  const appKeySecretKey = options.appKeySecretKey ?? generateSecretKey();
  const appKeyPubkey = getPublicKey(appKeySecretKey);
  const profileId = options.profileId ?? randomProfileId();
  const createdAt = options.createdAt ?? currentUnixSeconds();
  const label = options.label ?? 'This device';
  const bootstrap = signIrisProfileRosterOp({
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
        label,
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
}): IrisIdentitySession {
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

export function serializeIrisIdentitySession(session: IrisIdentitySession): StoredIrisIdentitySession {
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

export function restoreIrisIdentitySession(stored: StoredIrisIdentitySession): IrisIdentitySession {
  if (stored.schema !== 1) throw new Error(`unsupported Iris identity session schema ${stored.schema}`);
  const decoded = nip19.decode(stored.appKeyNsec);
  if (decoded.type !== 'nsec') throw new Error('stored Iris identity AppKey is not an nsec');
  const secretKey = decoded.data as Uint8Array;
  const appKeyPubkey = getPublicKey(secretKey);
  if (stored.status === 'active') {
    const projection = projectIrisProfileRoster(stored.profileId, stored.rosterOps);
    if (!projection.active_facets[appKeyPubkey]) {
      throw new Error('stored Iris identity AppKey is not active in its roster');
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

function currentUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function randomClientNonce(): string {
  return globalThis.crypto?.randomUUID?.() ?? `nonce-${Math.random().toString(36).slice(2)}`;
}

function randomProfileId(): IrisProfileId {
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
