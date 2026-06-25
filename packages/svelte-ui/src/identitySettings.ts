export interface IdentitySettingsCapabilities {
  can_write_roots?: boolean;
  can_admin_profile?: boolean;
  can_recover_app_keys?: boolean;
  can_receive_key_wraps?: boolean;
  can_decrypt_key_epochs?: boolean;
}

export interface IdentitySettingsKey {
  pubkey: string;
  label?: string;
  purposes?: string[];
  capabilities?: IdentitySettingsCapabilities;
  addedAt?: number;
  current?: boolean;
}

export interface IdentitySettingsPendingRequest {
  id: string;
  pubkey: string;
  label?: string;
  requestedAt?: number;
}

export function identitySettingsKeyLabel(key: IdentitySettingsKey): string {
  return key.label?.trim() || shortIdentityKey(key.pubkey);
}

export function shortIdentityKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 16) return trimmed;
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-6)}`;
}

export function identitySettingsCapabilityLabels(
  capabilities: IdentitySettingsCapabilities | undefined,
): string[] {
  const labels: string[] = [];
  if (capabilities?.can_admin_profile) labels.push('Admin');
  if (capabilities?.can_write_roots) labels.push('Write');
  if (capabilities?.can_recover_app_keys) labels.push('Recovery');
  if (capabilities?.can_decrypt_key_epochs) labels.push('Decrypt');
  if (capabilities?.can_receive_key_wraps) labels.push('Receive keys');
  return labels;
}
