import { finalizeEvent, getPublicKey, type Event } from 'nostr-tools';
import {
  IDENTITY_CAPABILITY_ADMIN,
  IDENTITY_CAPABILITY_DECRYPT_SECRET_EPOCHS,
  IDENTITY_CAPABILITY_RECEIVE_SECRET_WRAPS,
  IDENTITY_CAPABILITY_RECOVER,
  IDENTITY_CAPABILITY_WRITE,
  IDENTITY_PURPOSE_APP,
  IDENTITY_PURPOSE_PROFILE,
  IDENTITY_PURPOSE_RECOVERY,
  IDENTITY_PURPOSE_REMOTE_SIGNER,
  buildIdentityKeyAcceptanceDraft,
  buildIdentityRosterOpDraft,
  parseIdentityKeyAcceptanceEvent,
  parseIdentityRosterOpEvent,
  type IdentityKeyAcceptanceContent,
  type IdentityKeyCapability,
  type IdentityKeyPurpose,
  type IdentityRosterProjection,
  type IdentityRosterOp,
  type IdentityRosterOpContent,
  type SignedIdentityRosterOp,
} from 'nostr-social-graph';
import {
  IRIS_PROFILE_FACET_ACCEPTANCE_SCHEMA,
  IRIS_PROFILE_ROSTER_SCHEMA,
  type BuildIrisProfileFacetAcceptanceEventDraftOptions,
  type BuildIrisProfileFacetAcceptanceEventOptions,
  type BuildIrisProfileRosterOpEventDraftOptions,
  type BuildIrisProfileRosterOpEventOptions,
  type IrisNostrEventDraft,
  type IrisProfileCapabilities,
  type IrisProfileFacetAcceptanceContent,
  type IrisProfileKeyPurpose,
  type IrisProfileRosterProjection,
  type IrisProfileRosterOp,
  type IrisProfileRosterOpContent,
  type SignedIrisProfileFacetAcceptance,
  type SignedIrisProfileRosterOp,
  normalizeCapabilities,
  normalizeHexPubkey,
} from './profile.ts';
import {
  currentUnixSeconds,
  randomClientNonce,
  requireValidSignature,
} from './profileJson.ts';
import { normalizeRosterOp, sortPurposes } from './profileNormalize.ts';

export function buildIrisProfileRosterOpEventDraft(
  options: BuildIrisProfileRosterOpEventDraftOptions,
): IrisNostrEventDraft {
  const signerPubkey = normalizeHexPubkey(options.signerPubkey);
  if (!signerPubkey) throw new Error('roster signer pubkey must be 64-char hex');
  const createdAt = options.createdAt ?? currentUnixSeconds();
  const clientNonce = options.clientNonce ?? randomClientNonce();
  const parents = options.parents?.slice() ?? [];
  const draft = buildIdentityRosterOpDraft({
    signerPubkey,
    identity: options.profileId,
    op: irisProfileRosterOpToIdentity(normalizeRosterOp(options.op)),
    parents,
    ...(options.actorSeq !== undefined ? { actorSeq: options.actorSeq } : {}),
    createdAt,
    clientNonce,
  });

  return {
    kind: draft.kind,
    content: draft.content,
    created_at: createdAt,
    tags: draft.tags,
  };
}

export function buildIrisProfileRosterOpEvent(options: BuildIrisProfileRosterOpEventOptions): Event {
  return finalizeEvent(buildIrisProfileRosterOpEventDraft({
    ...options,
    signerPubkey: getPublicKey(options.signerSecretKey),
  }), options.signerSecretKey);
}

export function signIrisProfileRosterOp(
  options: BuildIrisProfileRosterOpEventOptions,
): SignedIrisProfileRosterOp {
  return parseIrisProfileRosterOpEvent(buildIrisProfileRosterOpEvent(options));
}

export function buildIrisProfileFacetAcceptanceEventDraft(
  options: BuildIrisProfileFacetAcceptanceEventDraftOptions,
): IrisNostrEventDraft {
  const facetPubkey = normalizeHexPubkey(options.signerPubkey);
  if (!facetPubkey) throw new Error('facet acceptance signer pubkey must be 64-char hex');
  const acceptedAt = options.acceptedAt ?? currentUnixSeconds();
  const clientNonce = options.clientNonce ?? randomClientNonce();
  const purposes = sortPurposes(options.purposes);
  const draft = buildIdentityKeyAcceptanceDraft({
    signerPubkey: facetPubkey,
    identity: options.profileId,
    purposes: purposes.map(irisPurposeToIdentity),
    ...(options.rosterOpId !== undefined ? { rosterOpId: options.rosterOpId } : {}),
    acceptedAt,
    clientNonce,
  });

  return {
    kind: draft.kind,
    content: draft.content,
    created_at: acceptedAt,
    tags: draft.tags,
  };
}

export function buildIrisProfileFacetAcceptanceEvent(
  options: BuildIrisProfileFacetAcceptanceEventOptions,
): Event {
  return finalizeEvent(buildIrisProfileFacetAcceptanceEventDraft({
    ...options,
    signerPubkey: getPublicKey(options.signerSecretKey),
  }), options.signerSecretKey);
}

export function signIrisProfileFacetAcceptance(
  options: BuildIrisProfileFacetAcceptanceEventOptions,
): SignedIrisProfileFacetAcceptance {
  return parseIrisProfileFacetAcceptanceEvent(buildIrisProfileFacetAcceptanceEvent(options));
}

export function parseIrisProfileRosterOpEvent(event: Event): SignedIrisProfileRosterOp {
  requireValidSignature(event);
  const signed = parseIdentityRosterOpEvent(event);
  const content = identityRosterContentToIris(signed.content);
  if (content.actor_pubkey !== event.pubkey) {
    throw new Error('roster actor signer mismatch');
  }
  if (content.created_at !== event.created_at) {
    throw new Error('roster created_at mismatch');
  }
  return {
    op_id: signed.opId,
    signer_pubkey: signed.signerPubkey,
    content,
    event_json: JSON.stringify(event),
  };
}

export function parseIrisProfileFacetAcceptanceEvent(event: Event): SignedIrisProfileFacetAcceptance {
  requireValidSignature(event);
  const signed = parseIdentityKeyAcceptanceEvent(event);
  const content = identityKeyAcceptanceContentToIris(signed.content);
  if (content.facet_pubkey !== event.pubkey) {
    throw new Error('facet acceptance signer mismatch');
  }
  if (content.accepted_at !== event.created_at) {
    throw new Error('facet acceptance accepted_at mismatch');
  }
  return {
    acceptance_id: signed.acceptanceId,
    signer_pubkey: signed.signerPubkey,
    content,
    event_json: JSON.stringify(event),
  };
}

export function irisProfileRosterOpToIdentity(op: IrisProfileRosterOp): IdentityRosterOp {
  if (op.op === 'add_facet') {
    return {
      op: 'add_key',
      key: {
        pubkey: requireHexPubkey(op.facet.pubkey, 'facet'),
        ...(op.facet.profile_id !== undefined ? { subject: op.facet.profile_id } : {}),
        purposes: (op.facet.purposes ?? []).map(irisPurposeToIdentity),
        capabilities: irisCapabilitiesToIdentity(op.facet.capabilities ?? {}),
        addedAt: op.facet.added_at,
        ...(op.facet.label !== undefined ? { label: op.facet.label } : {}),
      },
    };
  }
  if (op.op === 'tombstone_facet') {
    return {
      op: 'tombstone_key',
      pubkey: requireHexPubkey(op.pubkey, 'target'),
      ...(op.reason !== undefined ? { reason: op.reason } : {}),
    };
  }
  if (op.op === 'set_capabilities') {
    return {
      op: 'set_key_capabilities',
      pubkey: requireHexPubkey(op.pubkey, 'target'),
      capabilities: irisCapabilitiesToIdentity(op.capabilities),
    };
  }
  if (op.op === 'rotate_key_epoch') {
    return {
      op: 'rotate_secret_epoch',
      epoch: op.epoch,
      wrappedSecrets: normalizeWrappedDck(op.wrapped_dck ?? {}),
    };
  }
  return {
    op: 'repair_secret_wraps',
    epoch: op.epoch,
    wrappedSecrets: normalizeWrappedDck(op.wrapped_dck ?? {}),
  };
}

function identityRosterContentToIris(content: IdentityRosterOpContent): IrisProfileRosterOpContent {
  if (content.schema !== IRIS_PROFILE_ROSTER_SCHEMA) {
    throw new Error(`unsupported IrisProfile roster schema ${content.schema}`);
  }
  return {
    schema: IRIS_PROFILE_ROSTER_SCHEMA,
    profile_id: content.identity,
    actor_pubkey: content.actorPubkey,
    ...(content.actorSeq !== undefined ? { actor_seq: content.actorSeq } : {}),
    ...(content.parents?.length ? { parents: content.parents.slice() } : {}),
    client_nonce: content.clientNonce,
    created_at: content.createdAt,
    op: identityRosterOpToIrisProfile(content.op),
  };
}

export function signedIrisProfileRosterOpToIdentity(
  signed: SignedIrisProfileRosterOp,
): SignedIdentityRosterOp {
  return {
    opId: signed.op_id,
    signerPubkey: signed.signer_pubkey,
    content: {
      schema: signed.content.schema,
      identity: signed.content.profile_id,
      actorPubkey: signed.content.actor_pubkey,
      ...(signed.content.actor_seq !== undefined ? { actorSeq: signed.content.actor_seq } : {}),
      parents: signed.content.parents?.slice() ?? [],
      clientNonce: signed.content.client_nonce,
      createdAt: signed.content.created_at,
      op: irisProfileRosterOpToIdentity(signed.content.op),
    },
  };
}

export function identityRosterProjectionToIris(
  projection: IdentityRosterProjection,
): IrisProfileRosterProjection {
  return {
    profile_id: projection.identity,
    active_facets: Object.fromEntries(
      Object.entries(projection.activeKeys).map(([pubkey, key]) => [
        pubkey,
        {
          pubkey: key.pubkey,
          ...(key.subject !== undefined ? { profile_id: key.subject } : {}),
          ...(key.purposes.length ? { purposes: key.purposes.map(identityPurposeToIris) } : {}),
          capabilities: identityCapabilitiesToIris(key.capabilities),
          added_at: key.addedAt,
          ...(key.label !== undefined ? { label: key.label } : {}),
        },
      ]),
    ),
    tombstones: Object.fromEntries(
      Object.entries(projection.tombstones).map(([pubkey, tombstone]) => [
        pubkey,
        {
          pubkey: tombstone.pubkey,
          ...(tombstone.subject !== undefined ? { profile_id: tombstone.subject } : {}),
          removed_by_pubkey: tombstone.removedByPubkey,
          removed_at: tombstone.removedAt,
          ...(tombstone.reason !== undefined ? { reason: tombstone.reason } : {}),
        },
      ]),
    ),
    key_epochs: Object.fromEntries(
      Object.entries(projection.secretEpochs).map(([epoch, secretEpoch]) => [
        epoch,
        {
          epoch: secretEpoch.epoch,
          created_at: secretEpoch.createdAt,
          signed_by_pubkey: secretEpoch.signedByPubkey,
          wrapped_dck: secretEpoch.wrappedSecrets,
        },
      ]),
    ),
    accepted_op_ids: projection.acceptedOpIds,
    rejected_op_ids: projection.rejectedOpIds,
  };
}

export function identityRosterOpToIrisProfile(op: IdentityRosterOp): IrisProfileRosterOp {
  if (op.op === 'add_key') {
    const purposes = op.key.purposes.map(identityPurposeToIris);
    return {
      op: 'add_facet',
      facet: {
        pubkey: op.key.pubkey,
        ...(op.key.subject !== undefined ? { profile_id: op.key.subject } : {}),
        ...(purposes.length ? { purposes } : {}),
        capabilities: identityCapabilitiesToIris(op.key.capabilities),
        added_at: op.key.addedAt,
        ...(op.key.label !== undefined ? { label: op.key.label } : {}),
      },
    };
  }
  if (op.op === 'tombstone_key') {
    return {
      op: 'tombstone_facet',
      pubkey: op.pubkey,
      ...(op.reason !== undefined ? { reason: op.reason } : {}),
    };
  }
  if (op.op === 'set_key_capabilities') {
    return {
      op: 'set_capabilities',
      pubkey: op.pubkey,
      capabilities: identityCapabilitiesToIris(op.capabilities),
    };
  }
  if (op.op === 'rotate_secret_epoch') {
    return {
      op: 'rotate_key_epoch',
      epoch: op.epoch,
      wrapped_dck: op.wrappedSecrets,
    };
  }
  return {
    op: 'repair_key_wraps',
    epoch: op.epoch,
    wrapped_dck: op.wrappedSecrets,
  };
}

function identityKeyAcceptanceContentToIris(
  content: IdentityKeyAcceptanceContent,
): IrisProfileFacetAcceptanceContent {
  if (content.schema !== IRIS_PROFILE_FACET_ACCEPTANCE_SCHEMA) {
    throw new Error(`unsupported IrisProfile facet acceptance schema ${content.schema}`);
  }
  return {
    schema: IRIS_PROFILE_FACET_ACCEPTANCE_SCHEMA,
    profile_id: content.identity,
    facet_pubkey: content.keyPubkey,
    purposes: sortPurposes(content.purposes.map(identityPurposeToIris)),
    ...(content.rosterOpId !== undefined ? { roster_op_id: content.rosterOpId } : {}),
    client_nonce: content.clientNonce,
    accepted_at: content.acceptedAt,
  };
}

function irisCapabilitiesToIdentity(capabilities: IrisProfileCapabilities): IdentityKeyCapability[] {
  const normalized = normalizeCapabilities(capabilities);
  return [
    ...(normalized.can_write_roots ? [IDENTITY_CAPABILITY_WRITE] : []),
    ...(normalized.can_admin_profile ? [IDENTITY_CAPABILITY_ADMIN] : []),
    ...(normalized.can_recover_app_keys ? [IDENTITY_CAPABILITY_RECOVER] : []),
    ...(normalized.can_receive_key_wraps ? [IDENTITY_CAPABILITY_RECEIVE_SECRET_WRAPS] : []),
    ...(normalized.can_decrypt_key_epochs ? [IDENTITY_CAPABILITY_DECRYPT_SECRET_EPOCHS] : []),
  ].sort();
}

function identityCapabilitiesToIris(capabilities: IdentityKeyCapability[]): IrisProfileCapabilities {
  const iris: IrisProfileCapabilities = {};
  for (const capability of capabilities) {
    if (capability === IDENTITY_CAPABILITY_WRITE) iris.can_write_roots = true;
    else if (capability === IDENTITY_CAPABILITY_ADMIN) iris.can_admin_profile = true;
    else if (capability === IDENTITY_CAPABILITY_RECOVER) iris.can_recover_app_keys = true;
    else if (capability === IDENTITY_CAPABILITY_RECEIVE_SECRET_WRAPS) iris.can_receive_key_wraps = true;
    else if (capability === IDENTITY_CAPABILITY_DECRYPT_SECRET_EPOCHS) iris.can_decrypt_key_epochs = true;
    else throw new Error(`unsupported IrisProfile capability ${capability}`);
  }
  return normalizeCapabilities(iris);
}

function irisPurposeToIdentity(purpose: IrisProfileKeyPurpose): IdentityKeyPurpose {
  if (purpose === 'app_key') return IDENTITY_PURPOSE_APP;
  if (purpose === 'recovery_phrase') return IDENTITY_PURPOSE_RECOVERY;
  if (purpose === 'nip46_signer') return IDENTITY_PURPOSE_REMOTE_SIGNER;
  return IDENTITY_PURPOSE_PROFILE;
}

function identityPurposeToIris(purpose: IdentityKeyPurpose): IrisProfileKeyPurpose {
  if (purpose === IDENTITY_PURPOSE_APP) return 'app_key';
  if (purpose === IDENTITY_PURPOSE_RECOVERY) return 'recovery_phrase';
  if (purpose === IDENTITY_PURPOSE_REMOTE_SIGNER) return 'nip46_signer';
  if (purpose === IDENTITY_PURPOSE_PROFILE) return 'social_profile';
  throw new Error(`unsupported IrisProfile purpose ${purpose}`);
}

function normalizeWrappedDck(wrappedDck: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(wrappedDck)
      .map(([pubkey, wrapped]) => [requireHexPubkey(pubkey, 'wrapped DCK recipient'), wrapped] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function requireHexPubkey(value: string, label: string): string {
  const normalized = normalizeHexPubkey(value);
  if (!normalized) throw new Error(`${label} pubkey must be 64-char hex`);
  return normalized;
}
