import { nip19 } from 'nostr-tools';
import {
  APP_KEY_WRITER_CAPABILITIES,
  createAddAppKeyRosterOp,
  normalizeHexPubkey,
  type IrisProfileCapabilities,
  type IrisProfileId,
  type IrisProfileRosterOpContent,
  type SignedIrisProfileRosterOp,
} from './profile.ts';
import { irisProfileRosterParentIds } from './profileProjection.ts';

export const DEVICE_LINK_INVITE_PREFIX = 'iris-drive://invite/';
export const DEVICE_LINK_INVITE_SINGLE_SLASH_PREFIX = 'iris-drive:/invite/';
export const DEVICE_LINK_INVITE_WEB_PREFIX = 'https://drive.iris.to/invite/';
export const DEVICE_LINK_INVITE_VERSION = 1;

export interface DeviceLinkInvite {
  profileId: IrisProfileId;
  adminAppKeyPubkey: string;
  linkSecret: string;
}

export interface DeviceLinkRequest {
  profileId: IrisProfileId;
  adminAppKeyPubkey: string;
  deviceAppKeyPubkey: string;
  linkSecret: string;
  label?: string;
  requestedAt: number;
}

interface DeviceLinkInvitePayload {
  v?: number;
  profileId?: string;
  profile_id?: string;
  profile?: string;
  adminAppKeyNpub?: string;
  admin_app_key_npub?: string;
  admin?: string;
  linkSecret?: string;
  link_secret?: string;
  secret?: string;
  ownerNpub?: string;
  owner_npub?: string;
  owner?: string;
}

export function encodeDeviceLinkInvite(invite: DeviceLinkInvite): string {
  const payload = {
    v: DEVICE_LINK_INVITE_VERSION,
    profileId: invite.profileId,
    adminAppKeyNpub: pubkeyToNpub(invite.adminAppKeyPubkey),
    linkSecret: requireNonEmpty(invite.linkSecret, 'link secret'),
  };
  return `${DEVICE_LINK_INVITE_PREFIX}${base64UrlEncode(JSON.stringify(payload))}`;
}

export function parseDeviceLinkInvite(input: string): DeviceLinkInvite | null {
  const value = input.trim().replace(/^nostr:/i, '');
  if (!value) return null;
  const payload = payloadFromInviteUrl(value);
  if (payload !== null) {
    return parseInviteJson(base64UrlDecode(payload));
  }
  if (value.startsWith('{')) {
    return parseInviteJson(value);
  }
  const legacy = legacyInviteQuery(value);
  if (legacy !== null) {
    const params = new URLSearchParams(legacy);
    const profileId = params.get('profile') ?? params.get('profile_id') ?? params.get('owner');
    const admin = params.get('admin');
    const secret = params.get('secret');
    if (!profileId || !admin || !secret) return null;
    return normalizeInvitePayload({ profileId, admin, secret });
  }
  return null;
}

export function isCompleteDeviceLinkInviteInput(input: string): boolean {
  const value = input.trim().replace(/^nostr:/i, '');
  if (!value || /\s/.test(value)) return false;
  if (payloadFromShareInviteUrl(value) !== null) return false;
  const payload = payloadFromInviteUrl(value);
  if (payload !== null) return payload.length >= 32;
  const legacy = legacyInviteQuery(value);
  if (legacy !== null) {
    const params = new URLSearchParams(legacy);
    return Boolean((params.get('profile') ?? params.get('profile_id') ?? params.get('owner'))
      && params.get('admin')
      && params.get('secret'));
  }
  if (value.startsWith('{')) return parseDeviceLinkInvite(value) !== null;
  return false;
}

export function deviceLinkInviteWebUrl(inviteUrl: string): string {
  return inviteUrl.replacen(DEVICE_LINK_INVITE_PREFIX, DEVICE_LINK_INVITE_WEB_PREFIX, 1);
}

export function createDeviceLinkRequest(options: {
  invite: DeviceLinkInvite;
  deviceAppKeyPubkey: string;
  requestedAt: number;
  label?: string;
}): DeviceLinkRequest {
  const deviceAppKeyPubkey = requirePubkey(options.deviceAppKeyPubkey, 'device AppKey');
  return {
    profileId: options.invite.profileId,
    adminAppKeyPubkey: options.invite.adminAppKeyPubkey,
    deviceAppKeyPubkey,
    linkSecret: options.invite.linkSecret,
    requestedAt: options.requestedAt,
    ...(options.label?.trim() ? { label: options.label.trim() } : {}),
  };
}

export function approveDeviceLinkRequest(options: {
  request: DeviceLinkRequest;
  rosterOps: SignedIrisProfileRosterOp[];
  approvedByPubkey: string;
  approvedAt: number;
  clientNonce: string;
  capabilities?: IrisProfileCapabilities;
}): IrisProfileRosterOpContent {
  const approvedByPubkey = requirePubkey(options.approvedByPubkey, 'approving AppKey');
  if (approvedByPubkey !== options.request.adminAppKeyPubkey) {
    throw new Error('device link request must be approved by its invited admin AppKey');
  }
  return createAddAppKeyRosterOp({
    profileId: options.request.profileId,
    actorPubkey: approvedByPubkey,
    devicePubkey: options.request.deviceAppKeyPubkey,
    createdAt: options.approvedAt,
    clientNonce: options.clientNonce,
    parents: irisProfileRosterParentIds(options.rosterOps),
    label: options.request.label,
    capabilities: options.capabilities ?? APP_KEY_WRITER_CAPABILITIES,
  });
}

export function pubkeyToNpub(pubkey: string): string {
  return nip19.npubEncode(requirePubkey(pubkey, 'pubkey'));
}

export function npubToPubkey(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (!trimmed.startsWith('npub1')) return null;
  try {
    const decoded = nip19.decode(trimmed);
    return decoded.type === 'npub' && typeof decoded.data === 'string'
      ? decoded.data.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

function parseInviteJson(json: string): DeviceLinkInvite | null {
  try {
    return normalizeInvitePayload(JSON.parse(json) as DeviceLinkInvitePayload);
  } catch {
    return null;
  }
}

function normalizeInvitePayload(payload: DeviceLinkInvitePayload): DeviceLinkInvite | null {
  const version = payload.v ?? DEVICE_LINK_INVITE_VERSION;
  if (version !== DEVICE_LINK_INVITE_VERSION) return null;
  const profileId = payload.profileId ?? payload.profile_id ?? payload.profile;
  const admin = payload.adminAppKeyNpub ?? payload.admin_app_key_npub ?? payload.admin;
  const secret = payload.linkSecret ?? payload.link_secret ?? payload.secret;
  if (!profileId || !admin || !secret) return null;
  const adminAppKeyPubkey = npubToPubkey(admin);
  if (!adminAppKeyPubkey) return null;
  return {
    profileId,
    adminAppKeyPubkey,
    linkSecret: requireNonEmpty(secret, 'link secret'),
  };
}

function payloadFromInviteUrl(input: string): string | null {
  const lower = input.toLowerCase();
  const prefix = [
    DEVICE_LINK_INVITE_PREFIX,
    DEVICE_LINK_INVITE_SINGLE_SLASH_PREFIX,
    DEVICE_LINK_INVITE_WEB_PREFIX,
  ].find((candidate) => lower.startsWith(candidate));
  if (!prefix) return null;
  return input.slice(prefix.length).split(/[?#]/, 1)[0].trim();
}

function payloadFromShareInviteUrl(input: string): string | null {
  const lower = input.toLowerCase();
  const prefix = [
    'iris-drive://share-invite/',
    'iris-drive:/share-invite/',
    'https://drive.iris.to/share-invite/',
  ].find((candidate) => lower.startsWith(candidate));
  if (!prefix) return null;
  return input.slice(prefix.length).split(/[?#]/, 1)[0].trim();
}

function legacyInviteQuery(input: string): string | null {
  const lower = input.toLowerCase();
  const prefix = [
    'iris-drive://link-device',
    'iris-drive:/link-device',
    'https://drive.iris.to/link-device',
  ].find((candidate) => lower.startsWith(candidate));
  if (!prefix) return null;
  const rest = input.slice(prefix.length);
  return rest.startsWith('?') ? rest.slice(1) : null;
}

function base64UrlEncode(value: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64url');
  }
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function base64UrlDecode(value: string): string {
  if (looksLikePlaceholder(value)) throw new Error('device link invite is a placeholder');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64url').toString('utf8');
  }
  let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  base64 += '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function looksLikePlaceholder(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.includes('...') || trimmed.includes('...') || matchesPlaceholder(trimmed);
}

function matchesPlaceholder(value: string): boolean {
  return value === '<code>' || value === '<payload>' || value === '<invite>';
}

function requirePubkey(value: string, label: string): string {
  const normalized = normalizeHexPubkey(value);
  if (!normalized) throw new Error(`${label} pubkey must be npub or 64-char hex`);
  return normalized;
}

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  return trimmed;
}
