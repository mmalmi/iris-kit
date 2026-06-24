import { finalizeEvent, getPublicKey, type Event } from 'nostr-tools';
import {
  buildFactOpDraft,
  fact,
  parseFactOpEvent,
  type Fact,
  type FactOp,
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
  type IrisProfileRosterOp,
  type IrisProfileRosterOpContent,
  type SignedIrisProfileFacetAcceptance,
  type SignedIrisProfileRosterOp,
  normalizeCapabilities,
  normalizeHexPubkey,
} from './profile.ts';
import {
  currentUnixSeconds,
  isHex32,
  randomClientNonce,
  requireValidSignature,
} from './profileJson.ts';
import { normalizeRosterOp, sortPurposes } from './profileNormalize.ts';

const ROSTER_OP_TYPE = 'iris_profile_roster_op';
const FACET_ACCEPTANCE_TYPE = 'iris_profile_facet_acceptance';

const CAPABILITY_KEYS = [
  'can_write_roots',
  'can_admin_profile',
  'can_recover_app_keys',
  'can_receive_key_wraps',
  'can_decrypt_key_epochs',
] as const;

const PURPOSES = [
  'app_key',
  'recovery_phrase',
  'nip46_signer',
  'social_profile',
] as const;

type CapabilityKey = typeof CAPABILITY_KEYS[number];

export function buildIrisProfileRosterOpEventDraft(
  options: BuildIrisProfileRosterOpEventDraftOptions,
): IrisNostrEventDraft {
  const signerPubkey = normalizeHexPubkey(options.signerPubkey);
  if (!signerPubkey) throw new Error('roster signer pubkey must be 64-char hex');
  const createdAt = options.createdAt ?? currentUnixSeconds();
  const clientNonce = options.clientNonce ?? randomClientNonce();
  const parents = options.parents?.slice() ?? [];
  const content: IrisProfileRosterOpContent = {
    schema: IRIS_PROFILE_ROSTER_SCHEMA,
    profile_id: options.profileId,
    actor_pubkey: signerPubkey,
    ...(options.actorSeq !== undefined ? { actor_seq: options.actorSeq } : {}),
    ...(parents.length ? { parents } : {}),
    client_nonce: clientNonce,
    created_at: createdAt,
    op: normalizeRosterOp(options.op),
  };
  const draft = buildFactOpDraft(
    options.profileId,
    rosterOpContentFacts(content),
    { prev: parents },
  );

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
  const content: IrisProfileFacetAcceptanceContent = {
    schema: IRIS_PROFILE_FACET_ACCEPTANCE_SCHEMA,
    profile_id: options.profileId,
    facet_pubkey: facetPubkey,
    purposes,
    ...(options.rosterOpId !== undefined ? { roster_op_id: options.rosterOpId } : {}),
    client_nonce: clientNonce,
    accepted_at: acceptedAt,
  };
  const draft = buildFactOpDraft(
    options.profileId,
    facetAcceptanceContentFacts(content),
  );

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
  const op = parseFactOpEvent(event);
  const content = rosterOpContentFromFacts(op);
  if (content.actor_pubkey !== event.pubkey) {
    throw new Error('roster actor signer mismatch');
  }
  if (content.created_at !== event.created_at) {
    throw new Error('roster created_at mismatch');
  }
  return {
    op_id: event.id,
    signer_pubkey: event.pubkey,
    content,
    event_json: JSON.stringify(event),
  };
}

export function parseIrisProfileFacetAcceptanceEvent(event: Event): SignedIrisProfileFacetAcceptance {
  requireValidSignature(event);
  const op = parseFactOpEvent(event);
  const content = facetAcceptanceContentFromFacts(op);
  if (content.facet_pubkey !== event.pubkey) {
    throw new Error('facet acceptance signer mismatch');
  }
  if (content.accepted_at !== event.created_at) {
    throw new Error('facet acceptance accepted_at mismatch');
  }
  return {
    acceptance_id: event.id,
    signer_pubkey: event.pubkey,
    content,
    event_json: JSON.stringify(event),
  };
}

function rosterOpContentFacts(content: IrisProfileRosterOpContent): Fact[] {
  const facts = [
    fact('type', [ROSTER_OP_TYPE]),
    fact('schema', [String(content.schema)]),
    fact('actor_pubkey', [content.actor_pubkey]),
    ...(content.actor_seq !== undefined ? [fact('actor_seq', [String(content.actor_seq)])] : []),
    fact('client_nonce', [content.client_nonce]),
    fact('created_at', [String(content.created_at)]),
    fact('op', [content.op.op]),
  ];
  return facts.concat(rosterOpFacts(content.op));
}

function rosterOpFacts(op: IrisProfileRosterOp): Fact[] {
  if (op.op === 'add_facet') {
    return [
      fact('facet_pubkey', [op.facet.pubkey]),
      ...(op.facet.profile_id !== undefined ? [fact('facet_profile_id', [op.facet.profile_id])] : []),
      ...(op.facet.purposes ?? []).map((purpose) => fact('facet_purpose', [purpose])),
      ...capabilityFacts('facet_capability', op.facet.capabilities ?? {}),
      fact('facet_added_at', [String(op.facet.added_at)]),
      ...(op.facet.label !== undefined ? [fact('facet_label', [op.facet.label])] : []),
    ];
  }
  if (op.op === 'tombstone_facet') {
    return [
      fact('target_pubkey', [op.pubkey]),
      ...(op.reason !== undefined ? [fact('reason', [op.reason])] : []),
    ];
  }
  if (op.op === 'set_capabilities') {
    return [
      fact('target_pubkey', [op.pubkey]),
      ...capabilityFacts('capability', op.capabilities),
    ];
  }
  return [
    fact('key_epoch', [String(op.epoch)]),
    ...Object.entries(op.wrapped_dck ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([pubkey, wrapped]) => fact('wrapped_dck', [pubkey, wrapped])),
  ];
}

function facetAcceptanceContentFacts(content: IrisProfileFacetAcceptanceContent): Fact[] {
  return [
    fact('type', [FACET_ACCEPTANCE_TYPE]),
    fact('schema', [String(content.schema)]),
    fact('facet_pubkey', [content.facet_pubkey]),
    ...content.purposes.map((purpose) => fact('purpose', [purpose])),
    ...(content.roster_op_id !== undefined ? [fact('roster_op_id', [content.roster_op_id])] : []),
    fact('client_nonce', [content.client_nonce]),
    fact('accepted_at', [String(content.accepted_at)]),
  ];
}

function rosterOpContentFromFacts(op: FactOp): IrisProfileRosterOpContent {
  requireType(op, ROSTER_OP_TYPE);
  const schema = requiredInteger(op, 'schema');
  if (schema !== IRIS_PROFILE_ROSTER_SCHEMA) {
    throw new Error(`unsupported IrisProfile roster schema ${schema}`);
  }
  const content: IrisProfileRosterOpContent = {
    schema,
    profile_id: op.subject,
    actor_pubkey: requiredScalar(op, 'actor_pubkey'),
    ...(optionalInteger(op, 'actor_seq') !== undefined ? { actor_seq: optionalInteger(op, 'actor_seq') } : {}),
    ...(op.prev.length ? { parents: op.prev } : {}),
    client_nonce: requiredNonEmptyScalar(op, 'client_nonce'),
    created_at: requiredInteger(op, 'created_at'),
    op: rosterOpFromFacts(op),
  };
  return content;
}

function rosterOpFromFacts(op: FactOp): IrisProfileRosterOp {
  const kind = requiredScalar(op, 'op');
  if (kind === 'add_facet') {
    const purposes = purposeValues(op, 'facet_purpose');
    return {
      op: 'add_facet',
      facet: {
        pubkey: requiredScalar(op, 'facet_pubkey'),
        ...(optionalScalar(op, 'facet_profile_id') !== undefined
          ? { profile_id: optionalScalar(op, 'facet_profile_id') }
          : {}),
        ...(purposes.length ? { purposes } : {}),
        capabilities: capabilitiesFromFacts(op, 'facet_capability'),
        added_at: requiredInteger(op, 'facet_added_at'),
        ...(optionalScalar(op, 'facet_label') !== undefined ? { label: optionalScalar(op, 'facet_label') } : {}),
      },
    };
  }
  if (kind === 'tombstone_facet') {
    return {
      op: 'tombstone_facet',
      pubkey: requiredScalar(op, 'target_pubkey'),
      ...(optionalScalar(op, 'reason') !== undefined ? { reason: optionalScalar(op, 'reason') } : {}),
    };
  }
  if (kind === 'set_capabilities') {
    return {
      op: 'set_capabilities',
      pubkey: requiredScalar(op, 'target_pubkey'),
      capabilities: capabilitiesFromFacts(op, 'capability'),
    };
  }
  if (kind === 'rotate_key_epoch' || kind === 'repair_key_wraps') {
    return {
      op: kind,
      epoch: requiredInteger(op, 'key_epoch'),
      wrapped_dck: wrappedDckFromFacts(op),
    };
  }
  throw new Error(`unsupported IrisProfile roster op ${kind}`);
}

function facetAcceptanceContentFromFacts(op: FactOp): IrisProfileFacetAcceptanceContent {
  requireType(op, FACET_ACCEPTANCE_TYPE);
  const schema = requiredInteger(op, 'schema');
  if (schema !== IRIS_PROFILE_FACET_ACCEPTANCE_SCHEMA) {
    throw new Error(`unsupported IrisProfile facet acceptance schema ${schema}`);
  }
  const content: IrisProfileFacetAcceptanceContent = {
    schema,
    profile_id: op.subject,
    facet_pubkey: requiredScalar(op, 'facet_pubkey'),
    purposes: purposeValues(op, 'purpose'),
    ...(optionalScalar(op, 'roster_op_id') !== undefined
      ? { roster_op_id: optionalScalar(op, 'roster_op_id') }
      : {}),
    client_nonce: requiredNonEmptyScalar(op, 'client_nonce'),
    accepted_at: requiredInteger(op, 'accepted_at'),
  };
  if (!isHex32(content.facet_pubkey)) {
    throw new Error('facet acceptance pubkey is invalid');
  }
  if (content.purposes.length === 0) {
    throw new Error('facet acceptance purposes must not be empty');
  }
  if (content.roster_op_id && !isHex32(content.roster_op_id)) {
    throw new Error('facet acceptance roster op id is invalid');
  }
  return content;
}

function requireType(op: FactOp, expected: string): void {
  const value = requiredScalar(op, 'type');
  if (value !== expected) throw new Error(`unexpected IrisProfile fact event type ${value}`);
}

function capabilityFacts(predicate: string, capabilities: IrisProfileCapabilities): Fact[] {
  const normalized = normalizeCapabilities(capabilities);
  return CAPABILITY_KEYS
    .filter((key) => normalized[key])
    .map((key) => fact(predicate, [key]));
}

function capabilitiesFromFacts(op: FactOp, predicate: string): IrisProfileCapabilities {
  const capabilities: IrisProfileCapabilities = {};
  for (const value of scalarValues(op, predicate)) {
    if (!isCapabilityKey(value)) throw new Error(`unsupported IrisProfile capability ${value}`);
    capabilities[value] = true;
  }
  return normalizeCapabilities(capabilities);
}

function purposeValues(op: FactOp, predicate: string): IrisProfileKeyPurpose[] {
  const values = scalarValues(op, predicate);
  if (values.length === 0) return [];
  return sortPurposes(values.map((value) => {
    if (!isPurpose(value)) throw new Error(`unsupported IrisProfile purpose ${value}`);
    return value;
  }));
}

function wrappedDckFromFacts(op: FactOp): Record<string, string> {
  return Object.fromEntries(
    valueTuples(op, 'wrapped_dck').map((values) => {
      if (values.length !== 2) throw new Error('wrapped_dck fact must have pubkey and wrapped value');
      return values as [string, string];
    }).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function requiredScalar(op: FactOp, predicate: string): string {
  const value = optionalScalar(op, predicate);
  if (value === undefined) throw new Error(`missing IrisProfile fact ${predicate}`);
  return value;
}

function requiredNonEmptyScalar(op: FactOp, predicate: string): string {
  const value = requiredScalar(op, predicate);
  if (!value) throw new Error(`IrisProfile fact ${predicate} must not be empty`);
  return value;
}

function optionalScalar(op: FactOp, predicate: string): string | undefined {
  const values = valueTuples(op, predicate);
  if (values.length === 0) return undefined;
  if (values.length !== 1 || values[0].length !== 1) {
    throw new Error(`IrisProfile fact ${predicate} must be a single scalar`);
  }
  return values[0][0];
}

function scalarValues(op: FactOp, predicate: string): string[] {
  return valueTuples(op, predicate).map((values) => {
    if (values.length !== 1) throw new Error(`IrisProfile fact ${predicate} must be scalar`);
    return values[0];
  });
}

function requiredInteger(op: FactOp, predicate: string): number {
  const value = requiredScalar(op, predicate);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || String(parsed) !== value) {
    throw new Error(`IrisProfile fact ${predicate} must be an integer`);
  }
  return parsed;
}

function optionalInteger(op: FactOp, predicate: string): number | undefined {
  const value = optionalScalar(op, predicate);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || String(parsed) !== value) {
    throw new Error(`IrisProfile fact ${predicate} must be an integer`);
  }
  return parsed;
}

function valueTuples(op: FactOp, predicate: string): string[][] {
  return op.facts
    .filter((item) => item.predicate === predicate)
    .map((item) => item.values);
}

function isCapabilityKey(value: string): value is CapabilityKey {
  return CAPABILITY_KEYS.includes(value as CapabilityKey);
}

function isPurpose(value: string): value is IrisProfileKeyPurpose {
  return PURPOSES.includes(value as IrisProfileKeyPurpose);
}
