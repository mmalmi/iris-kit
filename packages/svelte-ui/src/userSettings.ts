export interface UserSettingsCapabilities {
  can_write_roots?: boolean;
  can_admin_profile?: boolean;
  can_recover_app_keys?: boolean;
  can_receive_key_wraps?: boolean;
  can_decrypt_key_epochs?: boolean;
}

export interface UserSettingsKey {
  pubkey: string;
  label?: string;
  purposes?: string[];
  capabilities?: UserSettingsCapabilities;
  addedAt?: number;
  current?: boolean;
}

export interface UserSettingsPendingRequest {
  id: string;
  pubkey: string;
  label?: string;
  requestedAt?: number;
}

export function userSettingsKeyLabel(key: UserSettingsKey): string {
  return key.label?.trim() || (key.current ? 'This device' : 'Linked key');
}

export function userSettingsCapabilityLabels(
  capabilities: UserSettingsCapabilities | undefined,
): string[] {
  const labels: string[] = [];
  if (capabilities?.can_admin_profile) labels.push('Admin');
  if (capabilities?.can_write_roots) labels.push('Write');
  if (capabilities?.can_recover_app_keys) labels.push('Recovery');
  if (capabilities?.can_decrypt_key_epochs) labels.push('Decrypt');
  if (capabilities?.can_receive_key_wraps) labels.push('Receive keys');
  return labels;
}
