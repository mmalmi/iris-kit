<script lang="ts">
  import CopyButton from './CopyButton.svelte';
  import {
    identitySettingsCapabilityLabels,
    identitySettingsKeyLabel,
    shortIdentityKey,
    type IdentitySettingsKey,
    type IdentitySettingsPendingRequest,
  } from './identitySettings';

  interface Props {
    identityName?: string;
    identityId?: string;
    currentKeyPubkey?: string;
    keys?: IdentitySettingsKey[];
    pendingRequests?: IdentitySettingsPendingRequest[];
    inviteUrl?: string;
    canManage?: boolean;
    inviteBusy?: boolean;
    actionBusyKey?: string;
    onCreateInvite?: () => void | Promise<void>;
    onApproveRequest?: (request: IdentitySettingsPendingRequest) => void | Promise<void>;
    onGrantAdmin?: (key: IdentitySettingsKey) => void | Promise<void>;
    onRevokeAdmin?: (key: IdentitySettingsKey) => void | Promise<void>;
    onRemoveKey?: (key: IdentitySettingsKey) => void | Promise<void>;
    class?: string;
  }

  let {
    identityName = 'Current identity',
    identityId = '',
    currentKeyPubkey = '',
    keys = [],
    pendingRequests = [],
    inviteUrl = '',
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
      || identitySettingsKeyLabel(left).localeCompare(identitySettingsKeyLabel(right))
      || left.pubkey.localeCompare(right.pubkey)),
  );

  function keyBusy(key: IdentitySettingsKey, action: string): boolean {
    return actionBusyKey === `${action}:${key.pubkey}`;
  }

  function requestBusy(request: IdentitySettingsPendingRequest): boolean {
    return actionBusyKey === `approve:${request.id}`;
  }
</script>

<div class={`identity-settings ${className}`.trim()} data-testid="identity-settings-panel">
  <section class="identity-summary" data-testid="identity-settings-summary">
    <div class="summary-icon" aria-hidden="true">
      <span class="i-lucide-fingerprint"></span>
    </div>
    <div class="summary-copy">
      <h3>{identityName}</h3>
      {#if identityId}
        <p>{identityId}</p>
      {/if}
      {#if currentKeyPubkey}
        <p>Current key {shortIdentityKey(currentKeyPubkey)}</p>
      {/if}
    </div>
  </section>

  <section class="panel-section" data-testid="identity-settings-link">
    <div class="section-heading">
      <div>
        <h4>Link keys</h4>
      </div>
      {#if canManage && onCreateInvite}
        <button
          type="button"
          class="secondary-button"
          onclick={() => onCreateInvite?.()}
          disabled={inviteBusy}
          data-testid="identity-create-link"
        >
          {#if inviteBusy}
            <span class="i-lucide-loader-2 spin" aria-hidden="true"></span>
          {:else}
            <span class="i-lucide-link" aria-hidden="true"></span>
          {/if}
          <span>Create link</span>
        </button>
      {/if}
    </div>

    {#if inviteUrl}
      <div class="copy-row" data-testid="identity-link-invite">
        <span class="copy-value">{inviteUrl}</span>
        <CopyButton
          text={inviteUrl}
          label="Copy"
          copiedLabel="Copied"
          class="copy-button"
          iconClass="i-lucide-copy"
          copiedIconClass="i-lucide-check"
          testId="identity-copy-link"
        />
      </div>
    {/if}

    {#if pendingRequests.length > 0}
      <div class="request-list">
        {#each pendingRequests as request (request.id)}
          <div class="request-row" data-testid="identity-link-request">
            <div>
              <strong>{request.label?.trim() || 'New key'}</strong>
              <span>{shortIdentityKey(request.pubkey)}</span>
            </div>
            {#if canManage && onApproveRequest}
              <button
                type="button"
                class="primary-button"
                onclick={() => onApproveRequest?.(request)}
                disabled={requestBusy(request)}
                data-testid="identity-approve-link"
              >
                {#if requestBusy(request)}
                  <span class="i-lucide-loader-2 spin" aria-hidden="true"></span>
                {:else}
                  <span class="i-lucide-check" aria-hidden="true"></span>
                {/if}
                <span>Approve</span>
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="panel-section" data-testid="identity-settings-keys">
    <div class="section-heading">
      <div>
        <h4>Keys</h4>
      </div>
    </div>

    <div class="key-list">
      {#each sortedKeys as key (key.pubkey)}
        {@const labels = identitySettingsCapabilityLabels(key.capabilities)}
        {@const isAdmin = Boolean(key.capabilities?.can_admin_profile)}
        <div class="key-row" data-testid="identity-key-row">
          <div class="key-main">
            <div class="key-title">
              <strong>{identitySettingsKeyLabel(key)}</strong>
              {#if key.current}
                <span class="badge current">Current</span>
              {/if}
            </div>
            <div class="key-pubkey">{shortIdentityKey(key.pubkey)}</div>
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
                  data-testid="identity-revoke-admin"
                >
                  <span>Remove admin</span>
                </button>
              {:else if !isAdmin && onGrantAdmin}
                <button
                  type="button"
                  class="secondary-button"
                  onclick={() => onGrantAdmin?.(key)}
                  disabled={keyBusy(key, 'grant-admin')}
                  data-testid="identity-grant-admin"
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
                  data-testid="identity-remove-key"
                >
                  <span class="i-lucide-trash-2" aria-hidden="true"></span>
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {:else}
        <p class="empty">No identity keys found.</p>
      {/each}
    </div>
  </section>
</div>

<style>
  .identity-settings {
    display: grid;
    gap: 16px;
    min-width: 0;
  }

  .identity-summary,
  .panel-section {
    border-radius: 8px;
    background: var(--identity-settings-surface, #f5f5f7);
    color: var(--identity-settings-text, #1d1d1f);
  }

  .identity-summary {
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
    background: var(--identity-settings-icon-bg, #e8e8ed);
    color: var(--identity-settings-accent, #007aff);
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
  .key-pubkey,
  .request-row span,
  .copy-value,
  .empty {
    color: var(--identity-settings-muted, #6e6e73);
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
  .copy-row {
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
  .key-row {
    border: 1px solid var(--identity-settings-border, #d2d2d7);
    border-radius: 8px;
    background: var(--identity-settings-row, #fff);
    padding: 10px;
  }

  .copy-value,
  .key-main,
  .request-row div {
    min-width: 0;
    flex: 1;
  }

  .copy-value,
  .key-pubkey,
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
    background: var(--identity-settings-badge-bg, #e8e8ed);
    color: var(--identity-settings-badge-text, #3a3a3c);
    font-size: 0.72rem;
    font-weight: 720;
    padding: 0 8px;
  }

  .badge.admin {
    background: color-mix(in srgb, var(--identity-settings-accent, #007aff) 16%, transparent);
    color: var(--identity-settings-accent, #007aff);
  }

  .badge.current {
    background: color-mix(in srgb, var(--identity-settings-success, #28a745) 16%, transparent);
    color: var(--identity-settings-success, #28a745);
  }

  button,
  .copy-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 34px;
    border: 1px solid var(--identity-settings-border, #d2d2d7);
    border-radius: 8px;
    background: var(--identity-settings-button, #fff);
    color: var(--identity-settings-text, #1d1d1f);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 740;
    padding: 0 10px;
    cursor: pointer;
  }

  .primary-button {
    border-color: transparent;
    background: var(--identity-settings-accent, #007aff);
    color: var(--identity-settings-accent-contrast, #fff);
  }

  .danger-button {
    color: var(--identity-settings-danger, #d93025);
  }

  button:disabled,
  .copy-button:disabled {
    cursor: default;
    opacity: 0.62;
  }

  .spin {
    animation: identity-settings-spin 0.9s linear infinite;
  }

  @keyframes identity-settings-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 560px) {
    .key-row,
    .request-row {
      align-items: stretch;
      flex-direction: column;
    }

    .key-actions,
    .request-row button {
      width: 100%;
    }
  }
</style>
