import type { Event } from 'nostr-tools';
import {
  normalizeHexPubkey,
  type IrisProfileId,
  type IrisProfileRosterProjection,
  type SignedIrisProfileRosterOp,
} from './profile.ts';
import {
  irisProfileRosterParentIds,
  projectIrisProfileRoster,
} from './profileProjection.ts';
import {
  buildIrisProfileRosterOpEventDraft,
  parseIrisProfileRosterOpEvent,
} from './profileEvents.ts';
import type { IrisAppKeySecretRewrapResult } from './appKeyAttach.ts';
import type { Awaitable, IrisIdentityEventSigner } from './signers.ts';

export interface IrisAppKeyRemovalContext {
  profileId: IrisProfileId;
  appKeyPubkey: string;
  removedByPubkey: string;
  rosterOp: SignedIrisProfileRosterOp;
  existingRosterOps: SignedIrisProfileRosterOp[];
  projectedRoster: IrisProfileRosterProjection;
}

export type IrisAppKeySecretRemovalHook = (
  context: IrisAppKeyRemovalContext,
) => Awaitable<IrisAppKeySecretRewrapResult[] | void>;

export interface RemoveIrisAppKeyOptions {
  profileId: IrisProfileId;
  signer: IrisIdentityEventSigner;
  rosterOps: SignedIrisProfileRosterOp[];
  appKeyPubkey: string;
  createdAt?: number;
  clientNonce?: string;
  reason?: string;
  requireSignerAuthorization?: boolean;
  rewrapSecrets?: IrisAppKeySecretRemovalHook;
}

export interface RemoveIrisAppKeyResult {
  profileId: IrisProfileId;
  appKeyPubkey: string;
  removedByPubkey: string;
  rosterOp: SignedIrisProfileRosterOp;
  rewrapResults: IrisAppKeySecretRewrapResult[];
  projectedRoster: IrisProfileRosterProjection;
}

export async function removeIrisAppKeyFromProfile(
  options: RemoveIrisAppKeyOptions,
): Promise<RemoveIrisAppKeyResult> {
  const appKeyPubkey = requireHexPubkey(options.appKeyPubkey, 'AppKey');
  const signerPubkey = await normalizedSignerPubkey(options.signer);
  const existingRosterOps = options.rosterOps.slice();
  const existingProjection = projectIrisProfileRoster(options.profileId, existingRosterOps);

  if (options.requireSignerAuthorization !== false) {
    requireSignerCanRemoveAppKey(existingProjection, signerPubkey, appKeyPubkey);
  }

  const draft = buildIrisProfileRosterOpEventDraft({
    signerPubkey,
    profileId: options.profileId,
    parents: irisProfileRosterParentIds(existingRosterOps),
    createdAt: options.createdAt,
    clientNonce: options.clientNonce,
    op: {
      op: 'tombstone_facet',
      pubkey: appKeyPubkey,
      ...(options.reason?.trim() ? { reason: options.reason.trim() } : {}),
    },
  });
  const signedEvent = await options.signer.signEvent(draft);
  const rosterOp = parseIrisProfileRosterOpEvent(signedEvent as Event);
  const projectedRoster = projectIrisProfileRoster(options.profileId, [
    ...existingRosterOps,
    rosterOp,
  ]);
  const rewrapResults = await runRemovalHook(options.rewrapSecrets, {
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
    rewrapResults,
    projectedRoster,
  };
}

export function signerCanRemoveAppKey(
  projection: IrisProfileRosterProjection,
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

function requireSignerCanRemoveAppKey(
  projection: IrisProfileRosterProjection,
  signerPubkey: string,
  appKeyPubkey: string,
): void {
  if (!signerCanRemoveAppKey(projection, signerPubkey, appKeyPubkey)) {
    throw new Error('identity signer is not authorized to remove this AppKey');
  }
}

async function normalizedSignerPubkey(signer: IrisIdentityEventSigner): Promise<string> {
  return requireHexPubkey(await signer.getPublicKey(), 'identity signer');
}

function requireHexPubkey(value: string, label: string): string {
  const normalized = normalizeHexPubkey(value);
  if (!normalized) throw new Error(`${label} pubkey must be 64-char hex`);
  return normalized;
}

async function runRemovalHook(
  hook: IrisAppKeySecretRemovalHook | undefined,
  context: IrisAppKeyRemovalContext,
): Promise<IrisAppKeySecretRewrapResult[]> {
  if (!hook) return [];
  return (await hook(context)) ?? [];
}
