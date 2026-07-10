<script lang="ts">
  import {
    userSettingsCapabilityLabels,
    userSettingsKeyLabel,
    type UserSettingsKey,
  } from './userSettings';

  type UserSettingsKeyBadgeMode = 'all' | 'admin' | 'none';

  interface Props {
    userName?: string;
    userDescription?: string;
    keys?: UserSettingsKey[];
    canManage?: boolean;
    showSummary?: boolean;
    showDevicesHeading?: boolean;
    showKeyBadges?: boolean;
    keyBadgeMode?: UserSettingsKeyBadgeMode;
    actionBusyKey?: string;
    onGrantAdmin?: (key: UserSettingsKey) => void | Promise<void>;
    onRevokeAdmin?: (key: UserSettingsKey) => void | Promise<void>;
    onRemoveKey?: (key: UserSettingsKey) => void | Promise<void>;
    class?: string;
  }

  let {
    userName = 'Current user',
    userDescription = '',
    keys = [],
    canManage = false,
    showSummary = true,
    showDevicesHeading = true,
    showKeyBadges = true,
    keyBadgeMode = undefined,
    actionBusyKey = '',
    onGrantAdmin = undefined,
    onRevokeAdmin = undefined,
    onRemoveKey = undefined,
    class: className = '',
  }: Props = $props();

  let sortedKeys = $derived(
    [...keys].sort((left, right) => Number(Boolean(right.current)) - Number(Boolean(left.current))
      || userSettingsKeyLabel(left).localeCompare(userSettingsKeyLabel(right))
      || left.pubkey.localeCompare(right.pubkey)),
  );

  let effectiveKeyBadgeMode = $derived(keyBadgeMode ?? (showKeyBadges ? 'all' : 'none'));

  function keyBusy(key: UserSettingsKey, action: string): boolean {
    return actionBusyKey === `${action}:${key.pubkey}`;
  }

  function keyBadgeLabels(key: UserSettingsKey): string[] {
    if (effectiveKeyBadgeMode === 'none') return [];
    if (effectiveKeyBadgeMode === 'admin') {
      return key.capabilities?.can_admin_profile ? ['Admin'] : [];
    }
    return userSettingsCapabilityLabels(key.capabilities);
  }
</script>

<div class={`user-settings ${className}`.trim()} data-testid="user-settings-panel">
  {#if showSummary}
    <section class="user-summary" data-testid="user-settings-summary">
      <div class="summary-icon" aria-hidden="true">
        <span class="i-lucide-user-round"></span>
      </div>
      <div class="summary-copy">
        <h3>{userName}</h3>
        {#if userDescription}
          <p>{userDescription}</p>
        {/if}
      </div>
    </section>
  {/if}

  <section class="panel-section" data-testid="user-settings-devices">
    {#if showDevicesHeading}
      <div class="section-heading">
        <div>
          <h4>Devices</h4>
        </div>
      </div>
    {/if}

    <div class="key-list" data-testid="user-settings-keys">
      {#each sortedKeys as key (key.pubkey)}
        {@const isAdmin = Boolean(key.capabilities?.can_admin_profile)}
        {@const labels = keyBadgeLabels(key)}
        <div class="key-row" data-testid="user-key-row">
          <div class="key-main">
            <div class="key-title">
              <span
                class:online={key.online}
                class="device-status-dot"
                aria-label={key.online ? 'Online' : 'Offline'}
                title={key.online ? 'Online' : 'Offline'}
                data-device-status={key.online ? 'online' : 'offline'}
                data-testid="user-key-status"
              ></span>
              <strong>{userSettingsKeyLabel(key)}</strong>
              {#if effectiveKeyBadgeMode === 'all' && key.current}
                <span class="badge current">Current</span>
              {/if}
            </div>
            {#if labels.length > 0}
              <div class="badge-row">
                {#each labels as label (label)}
                  <span class:admin={label === 'Admin'} class="badge">{label}</span>
                {/each}
              </div>
            {/if}
          </div>

          {#if canManage}
            <div class="key-actions">
              {#if isAdmin && onRevokeAdmin}
                <button
                  type="button"
                  class="secondary-button"
                  onclick={() => onRevokeAdmin?.(key)}
                  disabled={keyBusy(key, 'revoke-admin')}
                  data-testid="user-revoke-admin"
                >
                  <span>Remove admin</span>
                </button>
              {:else if !isAdmin && onGrantAdmin}
                <button
                  type="button"
                  class="secondary-button"
                  onclick={() => onGrantAdmin?.(key)}
                  disabled={keyBusy(key, 'grant-admin')}
                  data-testid="user-grant-admin"
                >
                  <span>Make admin</span>
                </button>
              {/if}

              {#if !key.current && onRemoveKey}
                <button
                  type="button"
                  class="danger-button"
                  aria-label="Remove device"
                  title="Remove device"
                  onclick={() => onRemoveKey?.(key)}
                  disabled={keyBusy(key, 'remove')}
                  data-testid="user-remove-key"
                >
                  <span class="i-lucide-trash-2" aria-hidden="true"></span>
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {:else}
        <p class="empty">No devices found.</p>
      {/each}
    </div>
  </section>
</div>

<style>
  .user-settings {
    display: grid;
    gap: 16px;
    min-width: 0;
  }

  .user-summary,
  .panel-section {
    border-radius: 8px;
    background: var(--user-settings-surface, #f5f5f7);
    color: var(--user-settings-text, #1d1d1f);
  }

  .user-summary {
    display: flex;
    gap: 12px;
    min-width: 0;
    padding: 14px;
  }

  .summary-icon {
    display: flex;
    width: 40px;
    height: 40px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: var(--user-settings-icon-bg, #e8e8ed);
    color: var(--user-settings-accent, #007aff);
  }

  .summary-copy {
    min-width: 0;
  }

  h3,
  h4,
  p {
    margin: 0;
  }

  h3 {
    font-size: 1rem;
    font-weight: 760;
  }

  h4 {
    font-size: 0.9rem;
    font-weight: 760;
  }

  p,
  .empty {
    color: var(--user-settings-muted, #6e6e73);
    font-size: 0.82rem;
  }

  .panel-section {
    display: grid;
    gap: 12px;
    padding: 14px;
  }

  .section-heading,
  .key-row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .section-heading {
    justify-content: space-between;
  }

  .key-row {
    border: 1px solid var(--user-settings-border, #d2d2d7);
    border-radius: 8px;
    background: var(--user-settings-row, #fff);
    padding: 10px;
  }

  .key-main {
    min-width: 0;
    flex: 1;
  }

  .key-list {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .key-title,
  .badge-row,
  .key-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .device-status-dot {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--user-settings-offline, #6e6e73);
  }

  .device-status-dot.online {
    background: var(--user-settings-success, #28a745);
  }

  .key-title strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    display: inline-flex;
    min-height: 22px;
    align-items: center;
    border-radius: 999px;
    background: var(--user-settings-badge-bg, #e8e8ed);
    color: var(--user-settings-badge-text, #3a3a3c);
    font-size: 0.72rem;
    font-weight: 720;
    padding: 0 8px;
  }

  .badge.admin {
    background: color-mix(in srgb, var(--user-settings-accent, #007aff) 16%, transparent);
    color: var(--user-settings-accent, #007aff);
  }

  .badge.current {
    background: color-mix(in srgb, var(--user-settings-success, #28a745) 16%, transparent);
    color: var(--user-settings-success, #28a745);
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 34px;
    border: 1px solid var(--user-settings-border, #d2d2d7);
    border-radius: 8px;
    background: var(--user-settings-button, #fff);
    color: var(--user-settings-text, #1d1d1f);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 740;
    padding: 0 10px;
    cursor: pointer;
  }

  .danger-button {
    color: var(--user-settings-danger, #d93025);
  }

  button:disabled {
    cursor: default;
    opacity: 0.62;
  }

  @media (max-width: 560px) {
    .key-row {
      align-items: stretch;
      flex-direction: column;
    }

    .key-actions {
      width: 100%;
    }
  }
</style>
