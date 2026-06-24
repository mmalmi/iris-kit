import { generateSecretKey, getPublicKey, nip19, type Event } from 'nostr-tools';
import {
  APP_KEY_WRITER_CAPABILITIES,
  appKeyFacet,
  normalizeHexPubkey,
  type IrisProfileCapabilities,
  type IrisProfileId,
  type IrisProfileRosterProjection,
  type SignedIrisProfileFacetAcceptance,
  type SignedIrisProfileRosterOp,
} from './profile.ts';
import type { IrisIdentitySession } from './session.ts';
import {
  irisProfileRosterParentIds,
  projectIrisProfileRoster,
} from './profileProjection.ts';
import {
  buildIrisProfileRosterOpEventDraft,
  parseIrisProfileRosterOpEvent,
  signIrisProfileFacetAcceptance,
} from './profileEvents.ts';
import type { Awaitable, IrisIdentityEventSigner } from './signers.ts';

export interface IrisAppKeySecretRewrapContext {
  profileId: IrisProfileId;
  appKeyPubkey: string;
  appKeyNpub: string;
  addedByPubkey: string;
  rosterOp: SignedIrisProfileRosterOp;
  facetAcceptance: SignedIrisProfileFacetAcceptance;
  existingRosterOps: SignedIrisProfileRosterOp[];
  projectedRoster?: IrisProfileRosterProjection;
}

export interface IrisAppKeySecretRewrapResult {
  secretId: string;
  status: 'rewrapped' | 'rotated' | 'skipped' | 'needs_user_action';
  epoch?: number;
  wrappedForAppKey?: string;
  detail?: string;
}

export type IrisAppKeySecretRewrapHook = (
  context: IrisAppKeySecretRewrapContext,
) => Awaitable<IrisAppKeySecretRewrapResult[] | void>;

export interface AttachIrisAppKeyOptions {
  profileId: IrisProfileId;
  signer: IrisIdentityEventSigner;
  rosterOps?: SignedIrisProfileRosterOp[];
  appKeySecretKey?: Uint8Array;
  createdAt?: number;
  clientNonce?: string;
  label?: string;
  capabilities?: IrisProfileCapabilities;
  requireSignerAuthorization?: boolean;
  rewrapSecrets?: IrisAppKeySecretRewrapHook;
}

export interface AttachIrisAppKeyResult {
  profileId: IrisProfileId;
  appKeyPubkey: string;
  appKeyNpub: string;
  appKeyNsec: string;
  addedByPubkey: string;
  rosterOp: SignedIrisProfileRosterOp;
  facetAcceptance: SignedIrisProfileFacetAcceptance;
  rewrapResults: IrisAppKeySecretRewrapResult[];
}

export interface CreateAttachedIrisIdentitySessionResult {
  session: IrisIdentitySession;
  attachment: AttachIrisAppKeyResult;
}

export async function attachIrisAppKeyToProfile(
  options: AttachIrisAppKeyOptions,
): Promise<AttachIrisAppKeyResult> {
  const appKeySecretKey = options.appKeySecretKey ?? generateSecretKey();
  const appKeyPubkey = getPublicKey(appKeySecretKey);
  const appKeyNpub = nip19.npubEncode(appKeyPubkey);
  const signerPubkey = await normalizedSignerPubkey(options.signer);
  const existingRosterOps = options.rosterOps?.slice() ?? [];
  const projectedRoster = existingRosterOps.length
    ? projectIrisProfileRoster(options.profileId, existingRosterOps)
    : undefined;

  if (options.requireSignerAuthorization !== false && projectedRoster) {
    requireSignerCanAttachAppKey(projectedRoster, signerPubkey);
  }

  const createdAt = options.createdAt ?? currentUnixSeconds();
  const parents = irisProfileRosterParentIds(existingRosterOps);
  const draft = buildIrisProfileRosterOpEventDraft({
    signerPubkey,
    profileId: options.profileId,
    parents,
    createdAt,
    clientNonce: options.clientNonce,
    op: {
      op: 'add_facet',
      facet: appKeyFacet(appKeyPubkey, {
        addedAt: createdAt,
        label: options.label,
        capabilities: options.capabilities ?? APP_KEY_WRITER_CAPABILITIES,
      }),
    },
  });
  const signedEvent = await options.signer.signEvent(draft);
  const rosterOp = parseIrisProfileRosterOpEvent(signedEvent as Event);
  const facetAcceptance = signIrisProfileFacetAcceptance({
    signerSecretKey: appKeySecretKey,
    profileId: options.profileId,
    purposes: ['app_key'],
    rosterOpId: rosterOp.op_id,
    acceptedAt: createdAt,
    clientNonce: `${rosterOp.content.client_nonce}:accept`,
  });
  const rewrapResults = await runRewrapHook(options.rewrapSecrets, {
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
    rewrapResults,
  };
}

export async function createAttachedIrisIdentitySession(
  options: AttachIrisAppKeyOptions,
): Promise<CreateAttachedIrisIdentitySessionResult> {
  const attachment = await attachIrisAppKeyToProfile(options);
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
  projection: IrisProfileRosterProjection,
  signerPubkey: string,
): boolean {
  const normalized = normalizeHexPubkey(signerPubkey);
  if (!normalized) return false;
  const capabilities = projection.active_facets[normalized]?.capabilities;
  return Boolean(capabilities?.can_admin_profile || capabilities?.can_recover_app_keys);
}

export function noopIrisAppKeySecretRewrap(): IrisAppKeySecretRewrapResult[] {
  return [];
}

function requireSignerCanAttachAppKey(
  projection: IrisProfileRosterProjection,
  signerPubkey: string,
): void {
  if (!signerCanAttachAppKey(projection, signerPubkey)) {
    throw new Error('identity signer is not authorized to attach AppKeys');
  }
}

async function normalizedSignerPubkey(signer: IrisIdentityEventSigner): Promise<string> {
  const pubkey = normalizeHexPubkey(await signer.getPublicKey());
  if (!pubkey) throw new Error('identity signer pubkey must be 64-char hex');
  return pubkey;
}

async function runRewrapHook(
  hook: IrisAppKeySecretRewrapHook | undefined,
  context: IrisAppKeySecretRewrapContext,
): Promise<IrisAppKeySecretRewrapResult[]> {
  if (!hook) return [];
  return (await hook(context)) ?? [];
}

function currentUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
