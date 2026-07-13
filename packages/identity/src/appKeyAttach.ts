import { generateSecretKey, getPublicKey, nip19, type Event } from 'nostr-tools';
import {
  APP_KEY_WRITER_CAPABILITIES,
  appKeyFacet,
  normalizeHexPubkey,
  type NostrIdentityCapabilities,
  type NostrIdentityId,
  type NostrIdentityRosterProjection,
  type SignedNostrIdentityFacetAcceptance,
  type SignedNostrIdentityRosterOp,
} from './profile.ts';
import type { NostrIdentitySession } from './session.ts';
import {
  nostrIdentityRosterParentIds,
  projectNostrIdentityRoster,
} from './profileProjection.ts';
import {
  buildNostrIdentityRosterOpEventDraft,
  parseNostrIdentityRosterOpEvent,
  signNostrIdentityFacetAcceptance,
} from './profileEvents.ts';
import { currentUnixSeconds } from './profileJson.ts';
import type { Awaitable, NostrIdentityEventSigner } from './signers.ts';

export interface NostrIdentityAppKeySecretRewrapContext {
  profileId: NostrIdentityId;
  appKeyPubkey: string;
  appKeyNpub: string;
  addedByPubkey: string;
  rosterOp: SignedNostrIdentityRosterOp;
  facetAcceptance: SignedNostrIdentityFacetAcceptance;
  existingRosterOps: SignedNostrIdentityRosterOp[];
  projectedRoster?: NostrIdentityRosterProjection;
}

export interface NostrIdentityAppKeySecretRewrapResult {
  secretId: string;
  status: 'rewrapped' | 'rotated' | 'skipped' | 'needs_user_action';
  epoch?: number;
  wrappedForAppKey?: string;
  detail?: string;
}

export type NostrIdentityAppKeySecretRewrapHook = (
  context: NostrIdentityAppKeySecretRewrapContext,
) => Awaitable<NostrIdentityAppKeySecretRewrapResult[] | void>;

export interface AttachNostrAppKeyOptions {
  profileId: NostrIdentityId;
  signer: NostrIdentityEventSigner;
  rosterOps?: SignedNostrIdentityRosterOp[];
  appKeySecretKey?: Uint8Array;
  createdAt?: number;
  clientNonce?: string;
  label?: string;
  encryptedDeviceLabels?: string;
  capabilities?: NostrIdentityCapabilities;
  requireSignerAuthorization?: boolean;
  rewrapSecrets?: NostrIdentityAppKeySecretRewrapHook;
}

export interface AttachNostrAppKeyResult {
  profileId: NostrIdentityId;
  appKeyPubkey: string;
  appKeyNpub: string;
  appKeyNsec: string;
  addedByPubkey: string;
  rosterOp: SignedNostrIdentityRosterOp;
  facetAcceptance: SignedNostrIdentityFacetAcceptance;
  rewrapResults: NostrIdentityAppKeySecretRewrapResult[];
}

export interface CreateAttachedNostrIdentitySessionResult {
  session: NostrIdentitySession;
  attachment: AttachNostrAppKeyResult;
}

export async function attachNostrAppKeyToIdentity(
  options: AttachNostrAppKeyOptions,
): Promise<AttachNostrAppKeyResult> {
  const appKeySecretKey = options.appKeySecretKey ?? generateSecretKey();
  const appKeyPubkey = getPublicKey(appKeySecretKey);
  const appKeyNpub = nip19.npubEncode(appKeyPubkey);
  const signerPubkey = normalizeHexPubkey(await options.signer.getPublicKey());
  if (!signerPubkey) throw new Error('identity signer pubkey must be 64-char hex');
  const existingRosterOps = options.rosterOps?.slice() ?? [];
  const projectedRoster = existingRosterOps.length
    ? projectNostrIdentityRoster(options.profileId, existingRosterOps)
    : undefined;

  if (
    options.requireSignerAuthorization !== false
    && projectedRoster
    && !signerCanAttachAppKey(projectedRoster, signerPubkey)
  ) {
    throw new Error('identity signer is not authorized to attach AppKeys');
  }

  const createdAt = options.createdAt ?? currentUnixSeconds();
  const parents = nostrIdentityRosterParentIds(existingRosterOps);
  const draft = buildNostrIdentityRosterOpEventDraft({
    signerPubkey,
    profileId: options.profileId,
    parents,
    createdAt,
    clientNonce: options.clientNonce,
    encryptedDeviceLabels: options.encryptedDeviceLabels,
    op: {
      op: 'add_facet',
      facet: appKeyFacet(appKeyPubkey, {
        addedAt: createdAt,
        capabilities: options.capabilities ?? APP_KEY_WRITER_CAPABILITIES,
      }),
    },
  });
  const signedEvent = await options.signer.signEvent(draft);
  const rosterOp = parseNostrIdentityRosterOpEvent(signedEvent as Event);
  const facetAcceptance = signNostrIdentityFacetAcceptance({
    signerSecretKey: appKeySecretKey,
    profileId: options.profileId,
    purposes: ['app_key'],
    rosterOpId: rosterOp.op_id,
    acceptedAt: createdAt,
    clientNonce: `${rosterOp.content.client_nonce}:accept`,
  });
  const rewrapResult = await options.rewrapSecrets?.({
    profileId: options.profileId,
    appKeyPubkey,
    appKeyNpub,
    addedByPubkey: signerPubkey,
    rosterOp,
    facetAcceptance,
    existingRosterOps,
    ...(projectedRoster ? { projectedRoster } : {}),
  });

  return {
    profileId: options.profileId,
    appKeyPubkey,
    appKeyNpub,
    appKeyNsec: nip19.nsecEncode(appKeySecretKey),
    addedByPubkey: signerPubkey,
    rosterOp,
    facetAcceptance,
    rewrapResults: Array.isArray(rewrapResult) ? rewrapResult : [],
  };
}

export async function createAttachedNostrIdentitySession(
  options: AttachNostrAppKeyOptions,
): Promise<CreateAttachedNostrIdentitySessionResult> {
  const attachment = await attachNostrAppKeyToIdentity(options);
  return {
    attachment,
    session: {
      profileId: options.profileId,
      appKeyPubkey: attachment.appKeyPubkey,
      appKeyNpub: attachment.appKeyNpub,
      appKeyNsec: attachment.appKeyNsec,
      status: 'active',
      rosterOps: [...(options.rosterOps ?? []), attachment.rosterOp],
      createdAt: attachment.rosterOp.content.created_at,
      ...(options.label?.trim() ? { label: options.label.trim() } : {}),
    },
  };
}

export function signerCanAttachAppKey(
  projection: NostrIdentityRosterProjection,
  signerPubkey: string,
): boolean {
  const normalized = normalizeHexPubkey(signerPubkey);
  if (!normalized) return false;
  const capabilities = projection.active_facets[normalized]?.capabilities;
  return Boolean(capabilities?.can_admin_profile || capabilities?.can_recover_app_keys);
}
