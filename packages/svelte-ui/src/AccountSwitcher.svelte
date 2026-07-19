<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  import Avatar from './Avatar.svelte';

  interface AccountSwitcherAccount {
    id: string;
    name: string;
    description?: string;
    picture?: string | null;
    avatarKey?: string;
    current?: boolean;
    default?: boolean;
    removable?: boolean;
  }

  interface Props {
    accounts?: AccountSwitcherAccount[];
    inputValue?: string;
    inputLabel?: string;
    addLabel?: string;
    showAddForm?: boolean;
    error?: string;
    autocomplete?: HTMLInputAttributes['autocomplete'];
    onInput?: (value: string) => void;
    onAdd?: (value: string) => void;
    onSelect?: (account: AccountSwitcherAccount) => void;
    onRemove?: (account: AccountSwitcherAccount) => void;
    class?: string;
  }

  let {
    accounts = [],
    inputValue = '',
    inputLabel = 'Add account',
    addLabel = 'Add',
    showAddForm = true,
    error = '',
    autocomplete = 'off',
    onInput = undefined,
    onAdd = undefined,
    onSelect = undefined,
    onRemove = undefined,
    class: className = '',
  }: Props = $props();

  const inputId = `iris-account-switcher-${Math.random().toString(36).slice(2)}`;
  const errorId = `${inputId}-error`;

  function handleInput(event: Event): void {
    onInput?.((event.currentTarget as HTMLInputElement).value);
  }

  function handleSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const input = (event.currentTarget as HTMLFormElement).querySelector<HTMLInputElement>('input');
    onAdd?.(input?.value ?? inputValue);
  }
</script>

<div class={`iris-account-switcher ${className}`.trim()}>
  {#if showAddForm}
    <form class="account-add-form" onsubmit={handleSubmit}>
      <label for={inputId}>
        <span>{inputLabel}</span>
        <input
          id={inputId}
          type="text"
          value={inputValue}
          {autocomplete}
          autocapitalize="none"
          spellcheck="false"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          oninput={handleInput}
        />
      </label>
      <button type="submit">{addLabel}</button>
    </form>
  {/if}

  {#if showAddForm && error}
    <p class="field-error" id={errorId}>{error}</p>
  {/if}

  <div class="account-list">
    {#each accounts as account (account.id)}
      <div class="account-row" class:active={account.current} data-testid="account-item">
        <button
          class="account-select-button"
          type="button"
          aria-current={account.current ? 'true' : undefined}
          onclick={() => onSelect?.(account)}
        >
          <Avatar
            pubkey={account.avatarKey ?? account.id}
            name={account.name}
            picture={account.picture}
            fallbackName={account.name}
            size={32}
            imgProxy={false}
            loadOriginalIfProxyFails={true}
            class="account-row-avatar"
          />
          <span class="account-row-text">
            <strong>{account.name}</strong>
            {#if account.description}
              <small>{account.description}</small>
            {/if}
          </span>
          {#if account.current}
            <span class="account-current">Current</span>
          {:else if account.default}
            <span class="account-current">Default</span>
          {/if}
        </button>

        {#if account.removable ?? !account.default}
          <button class="account-remove-button" type="button" onclick={() => onRemove?.(account)}>Remove</button>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .iris-account-switcher {
    display: grid;
    gap: 14px;
    min-width: 0;
  }

  .account-add-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: end;
  }

  .account-add-form label {
    display: grid;
    min-width: 0;
    gap: 6px;
  }

  .account-add-form label span {
    color: var(--text-muted, #6e6e73);
    font-size: 0.82rem;
    font-weight: 750;
  }

  .account-add-form input {
    width: 100%;
    min-width: 0;
    height: 42px;
    padding: 0 12px;
    border: 1px solid var(--line, #d2d2d7);
    border-radius: 999px;
    background: var(--surface-raised, #fff);
    color: var(--text, #1d1d1f);
    font: inherit;
    outline: none;
  }

  .account-add-form input:focus {
    border-color: var(--accent, #007aff);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #007aff) 18%, transparent);
  }

  .account-add-form button,
  .account-remove-button,
  .account-select-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 40px;
    border: 0;
    border-radius: 999px;
    background: var(--control-bg, #f5f5f7);
    color: var(--text, #1d1d1f);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .account-add-form button:hover:not(:disabled),
  .account-remove-button:hover:not(:disabled),
  .account-select-button:hover:not(:disabled) {
    background: var(--control-hover, #e8e8ed);
  }

  .field-error {
    margin: 0;
    color: var(--danger-text, #d93025);
    font-size: 0.82rem;
    font-weight: 650;
  }

  .account-list {
    display: grid;
    gap: 8px;
  }

  .account-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    padding: 5px;
    border: 1px solid var(--control-border, transparent);
    border-radius: 999px;
    background: var(--surface, #fff);
  }

  .account-row.active {
    background: var(--control-selected-bg, #e8f2ff);
  }

  .account-select-button {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    min-width: 0;
    min-height: 46px;
    padding: 4px 12px;
    background: transparent;
    text-align: left;
  }

  .account-row-text {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .account-row-text strong,
  .account-row-text small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-row-text small {
    color: var(--text-muted, #6e6e73);
    font-size: 0.78rem;
  }

  .account-current {
    border-radius: 999px;
    padding: 4px 8px;
    background: color-mix(in srgb, currentColor 8%, transparent);
    color: var(--accent-text, #007aff);
    font-size: 0.72rem;
    font-weight: 800;
  }

  .account-remove-button {
    padding: 0 12px;
    color: var(--text-muted, #6e6e73);
  }

  @media (prefers-color-scheme: dark) {
    .account-add-form input {
      border-color: transparent;
      background: var(--surface-raised, #1c1c1e);
    }

    .account-row {
      border-color: transparent;
      background: #171719;
    }
  }

  @media (max-width: 540px) {
    .account-add-form,
    .account-row {
      grid-template-columns: minmax(0, 1fr);
    }

    .account-select-button {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .account-current {
      justify-self: start;
      grid-column: 2;
    }

    .account-remove-button {
      justify-self: start;
    }
  }
</style>
