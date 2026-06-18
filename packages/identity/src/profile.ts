export const IRIS_PROFILE_ROSTER_SCHEMA = 1;
export const IRIS_PROFILE_FACET_ACCEPTANCE_SCHEMA = 1;
export const KIND_IRIS_PROFILE_ROSTER_OP = 30_078;
export const KIND_IRIS_PROFILE_FACET_ACCEPTANCE = 30_078;

export type IrisProfileId = string;
export type IrisProfileKeyPurpose =
  | 'app_key'
  | 'recovery_phrase'
  | 'nip46_signer'
  | 'social_profile';

export interface IrisProfileCapabilities {
  can_write_roots?: boolean;
  can_admin_profile?: boolean;
  can_recover_app_keys?: boolean;
  can_receive_key_wraps?: boolean;
  can_decrypt_key_epochs?: boolean;
}

export interface IrisProfileFacet {
  pubkey: string;
  profile_id?: IrisProfileId;
  purposes?: IrisProfileKeyPurpose[];
  capabilities?: IrisProfileCapabilities;
  added_at: number;
  label?: string;
}

export type IrisProfileRosterOp =
  | { op: 'add_facet'; facet: IrisProfileFacet }
  | { op: 'tombstone_facet'; pubkey: string; reason?: string }
  | { op: 'set_capabilities'; pubkey: string; capabilities: IrisProfileCapabilities }
  | { op: 'rotate_key_epoch'; epoch: number; wrapped_dck?: Record<string, string> }
  | { op: 'repair_key_wraps'; epoch: number; wrapped_dck?: Record<string, string> };

export interface IrisProfileRosterOpContent {
  schema: number;
  profile_id: IrisProfileId;
  actor_pubkey: string;
  actor_seq?: number;
  parents?: string[];
  client_nonce: string;
  created_at: number;
  op: IrisProfileRosterOp;
}

export interface SignedIrisProfileRosterOp {
  op_id: string;
  signer_pubkey: string;
  content: IrisProfileRosterOpContent;
  event_json: string;
}

export interface IrisProfileFacetAcceptanceContent {
  schema: number;
  profile_id: IrisProfileId;
  facet_pubkey: string;
  purposes: IrisProfileKeyPurpose[];
  roster_op_id?: string;
  client_nonce: string;
  accepted_at: number;
}

export interface SignedIrisProfileFacetAcceptance {
  acceptance_id: string;
  signer_pubkey: string;
  content: IrisProfileFacetAcceptanceContent;
  event_json: string;
}

export interface IrisProfileKeyEpoch {
  epoch: number;
  created_at: number;
  signed_by_pubkey: string;
  wrapped_dck: Record<string, string>;
}

export interface IrisProfileTombstone {
  pubkey: string;
  profile_id?: IrisProfileId;
  removed_by_pubkey: string;
  removed_at: number;
  reason?: string;
}

export interface IrisProfileRosterProjection {
  profile_id: IrisProfileId;
  active_facets: Record<string, IrisProfileFacet>;
  tombstones: Record<string, IrisProfileTombstone>;
  key_epochs: Record<string, IrisProfileKeyEpoch>;
  accepted_op_ids: string[];
  rejected_op_ids: string[];
}

export interface BuildIrisProfileRosterOpEventOptions {
  signerSecretKey: Uint8Array;
  profileId: IrisProfileId;
  op: IrisProfileRosterOp;
  parents?: string[];
  actorSeq?: number;
  createdAt?: number;
  clientNonce?: string;
}

export interface BuildIrisProfileFacetAcceptanceEventOptions {
  signerSecretKey: Uint8Array;
  profileId: IrisProfileId;
  purposes: IrisProfileKeyPurpose[];
  rosterOpId?: string;
  acceptedAt?: number;
  clientNonce?: string;
}

export const APP_KEY_ADMIN_CAPABILITIES: IrisProfileCapabilities = {
  can_write_roots: true,
  can_admin_profile: true,
  can_receive_key_wraps: true,
  can_decrypt_key_epochs: true,
};

export const APP_KEY_WRITER_CAPABILITIES: IrisProfileCapabilities = {
  can_write_roots: true,
  can_receive_key_wraps: true,
  can_decrypt_key_epochs: true,
};

export function normalizeHexPubkey(value: string): string | null {
  const trimmed = value.trim();
  return /^[0-9a-f]{64}$/i.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function isIrisProfileId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

export function appKeyFacet(
  pubkey: string,
  options: {
    addedAt: number;
    label?: string;
    capabilities?: IrisProfileCapabilities;
  },
): IrisProfileFacet {
  const normalized = normalizeHexPubkey(pubkey);
  if (!normalized) throw new Error('app key pubkey must be 64-char hex');
  return {
    pubkey: normalized,
    purposes: ['app_key'],
    capabilities: normalizeCapabilities(options.capabilities ?? APP_KEY_WRITER_CAPABILITIES),
    added_at: options.addedAt,
    ...(options.label?.trim() ? { label: options.label.trim() } : {}),
  };
}

export function createBootstrapRosterOp(options: {
  profileId: IrisProfileId;
  adminAppKeyPubkey: string;
  createdAt: number;
  clientNonce: string;
  label?: string;
}): IrisProfileRosterOpContent {
  requireProfileId(options.profileId);
  const actorPubkey = requireHexPubkey(options.adminAppKeyPubkey, 'admin AppKey');
  return {
    schema: IRIS_PROFILE_ROSTER_SCHEMA,
    profile_id: options.profileId,
    actor_pubkey: actorPubkey,
    client_nonce: requireNonce(options.clientNonce),
    created_at: options.createdAt,
    op: {
      op: 'add_facet',
      facet: appKeyFacet(actorPubkey, {
        addedAt: options.createdAt,
        label: options.label ?? 'This device',
        capabilities: APP_KEY_ADMIN_CAPABILITIES,
      }),
    },
  };
}

export function createAddAppKeyRosterOp(options: {
  profileId: IrisProfileId;
  actorPubkey: string;
  devicePubkey: string;
  createdAt: number;
  clientNonce: string;
  parents?: string[];
  label?: string;
  capabilities?: IrisProfileCapabilities;
}): IrisProfileRosterOpContent {
  requireProfileId(options.profileId);
  return {
    schema: IRIS_PROFILE_ROSTER_SCHEMA,
    profile_id: options.profileId,
    actor_pubkey: requireHexPubkey(options.actorPubkey, 'actor'),
    ...(options.parents?.length ? { parents: options.parents.slice() } : {}),
    client_nonce: requireNonce(options.clientNonce),
    created_at: options.createdAt,
    op: {
      op: 'add_facet',
      facet: appKeyFacet(options.devicePubkey, {
        addedAt: options.createdAt,
        label: options.label,
        capabilities: options.capabilities ?? APP_KEY_WRITER_CAPABILITIES,
      }),
    },
  };
}

export function canAdminProfile(projection: IrisProfileRosterProjection, pubkey: string): boolean {
  const normalized = normalizeHexPubkey(pubkey);
  return Boolean(normalized && projection.active_facets[normalized]?.capabilities?.can_admin_profile);
}

export function normalizeCapabilities(capabilities: IrisProfileCapabilities): IrisProfileCapabilities {
  return {
    ...(capabilities.can_write_roots ? { can_write_roots: true } : {}),
    ...(capabilities.can_admin_profile ? { can_admin_profile: true } : {}),
    ...(capabilities.can_recover_app_keys ? { can_recover_app_keys: true } : {}),
    ...(capabilities.can_receive_key_wraps ? { can_receive_key_wraps: true } : {}),
    ...(capabilities.can_decrypt_key_epochs ? { can_decrypt_key_epochs: true } : {}),
  };
}

function requireProfileId(profileId: IrisProfileId): void {
  if (!isIrisProfileId(profileId)) throw new Error('IrisProfile id must be a UUID');
}

function requireHexPubkey(value: string, label: string): string {
  const normalized = normalizeHexPubkey(value);
  if (!normalized) throw new Error(`${label} pubkey must be 64-char hex`);
  return normalized;
}

function requireNonce(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('client nonce is required');
  return trimmed;
}
