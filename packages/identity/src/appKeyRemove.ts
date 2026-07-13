import type { Event } from 'nostr-tools';
import {
  normalizeHexPubkey,
  type NostrIdentityId,
  type NostrIdentityRosterProjection,
  type SignedNostrIdentityRosterOp,
} from './profile.ts';
import {
  nostrIdentityRosterParentIds,
  projectNostrIdentityRoster,
} from './profileProjection.ts';
import {
  buildNostrIdentityRosterOpEventDraft,
  parseNostrIdentityRosterOpEvent,
} from './profileEvents.ts';
import type { NostrIdentityAppKeySecretRewrapResult } from './appKeyAttach.ts';
import type { Awaitable, NostrIdentityEventSigner } from './signers.ts';

export interface NostrIdentityAppKeyRemovalContext {
  profileId: NostrIdentityId;
  appKeyPubkey: string;
  removedByPubkey: string;
  rosterOp: SignedNostrIdentityRosterOp;
  existingRosterOps: SignedNostrIdentityRosterOp[];
  projectedRoster: NostrIdentityRosterProjection;
}

export type NostrIdentityAppKeySecretRemovalHook = (
  context: NostrIdentityAppKeyRemovalContext,
) => Awaitable<NostrIdentityAppKeySecretRewrapResult[] | void>;

export interface RemoveNostrAppKeyOptions {
  profileId: NostrIdentityId;
  signer: NostrIdentityEventSigner;
  rosterOps: SignedNostrIdentityRosterOp[];
  appKeyPubkey: string;
  createdAt?: number;
  clientNonce?: string;
  reason?: string;
  requireSignerAuthorization?: boolean;
  rewrapSecrets?: NostrIdentityAppKeySecretRemovalHook;
}

export interface RemoveNostrAppKeyResult {
  profileId: NostrIdentityId;
  appKeyPubkey: string;
  removedByPubkey: string;
  rosterOp: SignedNostrIdentityRosterOp;
  rewrapResults: NostrIdentityAppKeySecretRewrapResult[];
  projectedRoster: NostrIdentityRosterProjection;
}

export async function removeNostrAppKeyFromIdentity(
  options: RemoveNostrAppKeyOptions,
): Promise<RemoveNostrAppKeyResult> {
  const appKeyPubkey = normalizeHexPubkey(options.appKeyPubkey);
  if (!appKeyPubkey) throw new Error('AppKey pubkey must be 64-char hex');
  const signerPubkey = normalizeHexPubkey(await options.signer.getPublicKey());
  if (!signerPubkey) throw new Error('identity signer pubkey must be 64-char hex');
  const existingRosterOps = options.rosterOps.slice();
  const existingProjection = projectNostrIdentityRoster(options.profileId, existingRosterOps);

  if (
    options.requireSignerAuthorization !== false
    && !signerCanRemoveAppKey(existingProjection, signerPubkey, appKeyPubkey)
  ) {
    throw new Error('identity signer is not authorized to remove this AppKey');
  }

  const draft = buildNostrIdentityRosterOpEventDraft({
    signerPubkey,
    profileId: options.profileId,
    parents: nostrIdentityRosterParentIds(existingRosterOps),
    createdAt: options.createdAt,
    clientNonce: options.clientNonce,
    op: {
      op: 'tombstone_facet',
      pubkey: appKeyPubkey,
      ...(options.reason?.trim() ? { reason: options.reason.trim() } : {}),
    },
  });
  const signedEvent = await options.signer.signEvent(draft);
  const rosterOp = parseNostrIdentityRosterOpEvent(signedEvent as Event);
  const projectedRoster = projectNostrIdentityRoster(options.profileId, [
    ...existingRosterOps,
    rosterOp,
  ]);
  const rewrapResult = await options.rewrapSecrets?.({
    profileId: options.profileId,
    appKeyPubkey,
    removedByPubkey: signerPubkey,
    rosterOp,
    existingRosterOps,
    projectedRoster,
  });

  return {
    profileId: options.profileId,
    appKeyPubkey,
    removedByPubkey: signerPubkey,
    rosterOp,
    rewrapResults: Array.isArray(rewrapResult) ? rewrapResult : [],
    projectedRoster,
  };
}

export function signerCanRemoveAppKey(
  projection: NostrIdentityRosterProjection,
  signerPubkey: string,
  appKeyPubkey: string,
): boolean {
  const signer = normalizeHexPubkey(signerPubkey);
  const target = normalizeHexPubkey(appKeyPubkey);
  if (!signer || !target) return false;

  const targetFacet = projection.active_facets[target];
  if (!targetFacet?.purposes?.includes('app_key')) return false;

  const signerCapabilities = projection.active_facets[signer]?.capabilities;
  if (!signerCapabilities?.can_admin_profile && !signerCapabilities?.can_recover_app_keys) {
    return false;
  }

  if (targetFacet.capabilities?.can_admin_profile) {
    const activeAdminCount = Object.values(projection.active_facets)
      .filter((facet) => facet.purposes?.includes('app_key'))
      .filter((facet) => facet.capabilities?.can_admin_profile)
      .length;
    if (activeAdminCount <= 1) return false;
  }

  return true;
}
