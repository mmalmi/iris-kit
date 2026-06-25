<script lang="ts">
  import CopyButton from './CopyButton.svelte';
  import {
    userSettingsCapabilityLabels,
    userSettingsKeyLabel,
    type UserSettingsKey,
    type UserSettingsPendingRequest,
  } from './userSettings';

  interface Props {
    userName?: string;
    userDescription?: string;
    keys?: UserSettingsKey[];
    pendingRequests?: UserSettingsPendingRequest[];
    inviteUrl?: string;
    inviteQrUrl?: string;
    canManage?: boolean;
    inviteBusy?: boolean;
    actionBusyKey?: string;
    onCreateInvite?: () => void | Promise<void>;
    onApproveRequest?: (request: UserSettingsPendingRequest) => void | Promise<void>;
    onGrantAdmin?: (key: UserSettingsKey) => void | Promise<void>;
    onRevokeAdmin?: (key: UserSettingsKey) => void | Promise<void>;
    onRemoveKey?: (key: UserSettingsKey) => void | Promise<void>;
    class?: string;
  }

  let {
    userName = 'Current user',
    userDescription = '',
    keys = [],
    pendingRequests = [],
    inviteUrl = '',
    inviteQrUrl = '',
    canManage = false,
    inviteBusy = false,
    actionBusyKey = '',
    onCreateInvite = undefined,
    onApproveRequest = undefined,
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

  let showAddDevice = $state(false);

  $effect(() => {
    if (pendingRequests.length > 0) showAddDevice = true;
  });

  function keyBusy(key: UserSettingsKey, action: string): boolean {
    return actionBusyKey === `${action}:${key.pubkey}`;
  }

  function requestBusy(request: UserSettingsPendingRequest): boolean {
    return actionBusyKey === `approve:${request.id}`;
  }

  function toggleAddDevice(): void {
    const nextShowAddDevice = !showAddDevice;
    showAddDevice = nextShowAddDevice;
    if (nextShowAddDevice && !inviteUrl && !inviteBusy) {
      void onCreateInvite?.();
    }
  }
</script>

<div class={`user-settings ${className}`.trim()} data-testid="user-settings-panel">
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

  <section class="panel-section" data-testid="user-settings-devices">
    <div class="section-heading">
      <div>
        <h4>Devices</h4>
      </div>
    </div>

    {#if canManage}
      <div class="add-device-section" data-testid="user-add-device-section">
        <button
          type="button"
          class="add-device-toggle"
          onclick={toggleAddDevice}
          aria-expanded={showAddDevice}
          data-testid="user-add-device-toggle"
        >
          <span class="i-lucide-plus" aria-hidden="true"></span>
          <span>Add Device</span>
          {#if pendingRequests.length > 0}
            <span class="request-count">{pendingRequests.length} request{pendingRequests.length === 1 ? '' : 's'}</span>
          {/if}
          <span class={`i-lucide-chevron-right add-device-chevron ${showAddDevice ? 'open' : ''}`} aria-hidden="true"></span>
        </button>

        {#if showAddDevice}
          <div class="add-device-panel" data-testid="user-add-device-panel">
            {#if inviteUrl}
              <div class="invite-card">
                {#if inviteQrUrl}
                  <img
                    class="invite-qr"
                    src={inviteQrUrl}
                    alt="Add Device QR code"
                    data-testid="user-link-invite-qr"
                  />
                {/if}
                <div class="copy-row" data-testid="user-link-invite">
                  <span class="copy-value">{inviteUrl}</span>
                  <CopyButton
                    text={inviteUrl}
                    label="Copy"
                    copiedLabel="Copied"
                    class="copy-button"
                    iconClass="i-lucide-copy"
                    copiedIconClass="i-lucide-check"
                    testId="user-copy-link"
                  />
                </div>
              </div>
            {:else if inviteBusy}
              <div class="invite-loading" data-testid="user-link-invite-loading">
                <span class="i-lucide-loader-2 spin" aria-hidden="true"></span>
                <span>Preparing invite...</span>
              </div>
            {/if}

            {#if pendingRequests.length > 0}
              <div class="request-list">
                <h5>Device requests</h5>
                {#each pendingRequests as request (request.id)}
                  <div class="request-row" data-testid="user-link-request">
                    <div>
                      <strong>{request.label?.trim() || 'New device'}</strong>
                      <span>Waiting to be linked</span>
                    </div>
                    {#if onApproveRequest}
                      <button
                        type="button"
                        class="primary-button"
                        onclick={() => onApproveRequest?.(request)}
                        disabled={requestBusy(request)}
                        data-testid="user-approve-link"
                      >
                        {#if requestBusy(request)}
                          <span class="i-lucide-loader-2 spin" aria-hidden="true"></span>
                        {:else}
                          <span class="i-lucide-check" aria-hidden="true"></span>
                        {/if}
                        <span>Add</span>
                      </button>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <div class="key-list" data-testid="user-settings-keys">
      {#each sortedKeys as key (key.pubkey)}
        {@const labels = userSettingsCapabilityLabels(key.capabilities)}
        {@const isAdmin = Boolean(key.capabilities?.can_admin_profile)}
        <div class="key-row" data-testid="user-key-row">
          <div class="key-main">
            <div class="key-title">
              <strong>{userSettingsKeyLabel(key)}</strong>
              {#if key.current}
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
  h5,
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

  h5 {
    font-size: 0.84rem;
    font-weight: 760;
  }

  p,
  .request-row span,
  .copy-value,
  .request-count,
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
  .key-row,
  .request-row,
  .copy-row,
  .add-device-toggle {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .section-heading {
    justify-content: space-between;
  }

  .copy-row,
  .request-row,
  .key-row,
  .invite-loading,
  .add-device-section {
    border: 1px solid var(--user-settings-border, #d2d2d7);
    border-radius: 8px;
    background: var(--user-settings-row, #fff);
    padding: 10px;
  }

  .add-device-section,
  .add-device-panel,
  .invite-card {
    display: grid;
    gap: 12px;
    min-width: 0;
  }

  .add-device-toggle {
    width: 100%;
    min-height: 36px;
    justify-content: flex-start;
    border: 0;
    background: transparent;
    padding: 0;
  }

  .add-device-toggle > span:nth-child(2) {
    flex: 1;
    text-align: left;
  }

  .add-device-chevron {
    transition: transform 0.15s ease;
  }

  .add-device-chevron.open {
    transform: rotate(90deg);
  }

  .request-count {
    flex: 0 0 auto;
  }

  .invite-loading {
    color: var(--user-settings-muted, #6e6e73);
    font-size: 0.82rem;
    font-weight: 700;
  }

  .invite-card {
    justify-items: center;
  }

  .invite-qr {
    width: min(220px, 100%);
    aspect-ratio: 1;
    border-radius: 8px;
    background: #fff;
    padding: 8px;
  }

  .invite-card .copy-row {
    width: 100%;
  }

  .copy-value,
  .key-main,
  .request-row div {
    min-width: 0;
    flex: 1;
  }

  .copy-value,
  .request-row span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .request-list,
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

  .key-title strong,
  .request-row strong {
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

  button,
  .copy-button {
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

  .primary-button {
    border-color: transparent;
    background: var(--user-settings-accent, #007aff);
    color: var(--user-settings-accent-contrast, #fff);
  }

  .danger-button {
    color: var(--user-settings-danger, #d93025);
  }

  button:disabled,
  .copy-button:disabled {
    cursor: default;
    opacity: 0.62;
  }

  .spin {
    animation: user-settings-spin 0.9s linear infinite;
  }

  @keyframes user-settings-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 560px) {
    .key-row,
    .request-row,
    .copy-row {
      align-items: stretch;
      flex-direction: column;
    }

    .key-actions,
    .request-row button,
    .copy-button {
      width: 100%;
    }
  }
</style>
