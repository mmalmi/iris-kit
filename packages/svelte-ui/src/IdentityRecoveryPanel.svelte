<script lang="ts">
  import {
    IDENTITY_RECOVERY_METHODS,
    identityRecoveryRequestHasInput,
    normalizeIdentityRecoveryRequest,
    type IdentityRecoveryMethod,
    type IdentityRecoveryRequest,
  } from './identityRecovery';

  interface Props {
    method?: IdentityRecoveryMethod;
    methodLayout?: 'grid' | 'column';
    disabled?: boolean;
    submitLabel?: string;
    error?: string;
    nostrAvailable?: boolean;
    showCreateNew?: boolean;
    createNewTitle?: string;
    createNewDescription?: string;
    createNewLabel?: string;
    createNewBusy?: boolean;
    createNewDisabled?: boolean;
    createNewTestId?: string;
    onMethodChange?: (method: IdentityRecoveryMethod) => void;
    onSubmit?: (request: IdentityRecoveryRequest) => void | Promise<void>;
    onCreateNew?: () => void | Promise<void>;
    onCreateNewBack?: () => void;
    class?: string;
  }

  let {
    method = undefined,
    methodLayout = 'grid',
    disabled = false,
    submitLabel = 'Continue',
    error = '',
    nostrAvailable = true,
    showCreateNew = false,
    createNewTitle = 'No identity found',
    createNewDescription = '',
    createNewLabel = 'Create new',
    createNewBusy = false,
    createNewDisabled = false,
    createNewTestId = 'identity-recovery-create-new',
    onMethodChange = undefined,
    onSubmit = undefined,
    onCreateNew = undefined,
    onCreateNewBack = undefined,
    class: className = '',
  }: Props = $props();

  let selected = $state<IdentityRecoveryMethod | null>(method ?? null);
  let lastPropMethod = $state<IdentityRecoveryMethod | undefined>(method);
  let nsec = $state('');
  let seedWords = $state('');
  let seedPassphrase = $state('');
  let nip46Connection = $state('');
  let nip46Relay = $state('');
  let submittingImmediate = $state(false);
  let creatingImmediate = $state(false);

  const errorId = `iris-identity-recovery-${Math.random().toString(36).slice(2)}-error`;
  const effectiveCreateNewBusy = $derived(createNewBusy || creatingImmediate);
  const effectiveDisabled = $derived(disabled || submittingImmediate || effectiveCreateNewBusy);
  const canCreateNew = $derived(
    Boolean(onCreateNew)
      && showCreateNew
      && !disabled
      && !submittingImmediate
      && !createNewDisabled
      && !effectiveCreateNewBusy,
  );
  const visibleMethods = $derived(
    IDENTITY_RECOVERY_METHODS.filter((option) => option.id !== 'nip07' || nostrAvailable),
  );
  const selectedOption = $derived(IDENTITY_RECOVERY_METHODS.find((option) => option.id === selected));
  const request = $derived<IdentityRecoveryRequest | null>(selected ? {
    method: selected,
    ...(nsec ? { nsec } : {}),
    ...(seedWords ? { seedWords } : {}),
    ...(seedPassphrase ? { seedPassphrase } : {}),
    ...(nip46Connection ? { nip46Connection } : {}),
    ...(nip46Relay ? { nip46Relay } : {}),
  } : null);
  const canSubmit = $derived(
    !effectiveDisabled
      && request !== null
      && (selected !== 'nip07' || nostrAvailable)
      && identityRecoveryRequestHasInput(request),
  );

  $effect(() => {
    if (method !== lastPropMethod) {
      selected = method ?? null;
      lastPropMethod = method;
    }
  });

  $effect(() => {
    if (selected === 'nip07') {
      selected = null;
    }
  });

  async function selectMethod(nextMethod: IdentityRecoveryMethod): Promise<void> {
    if (effectiveDisabled) return;
    onMethodChange?.(nextMethod);
    if (nextMethod === 'nip07') {
      if (!nostrAvailable || submittingImmediate) return;
      submittingImmediate = true;
      try {
        await onSubmit?.({ method: 'nip07' });
      } finally {
        submittingImmediate = false;
      }
      return;
    }
    selected = nextMethod;
  }

  function clearMethod(): void {
    if (effectiveDisabled) return;
    selected = null;
  }

  function dismissCreateNew(): void {
    if (effectiveDisabled) return;
    selected = null;
    onCreateNewBack?.();
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit || !request) return;
    await onSubmit?.(normalizeIdentityRecoveryRequest(request));
  }

  async function createNew(): Promise<void> {
    if (!canCreateNew || !onCreateNew) return;
    creatingImmediate = true;
    try {
      await onCreateNew();
    } finally {
      creatingImmediate = false;
    }
  }
</script>

<form class={`iris-identity-recovery ${className}`.trim()} onsubmit={submit}>
  {#if showCreateNew}
    <div class="recovery-result" data-testid="identity-recovery-create-new-view">
      <div class="selected-method">
        <button
          type="button"
          class="method-back"
          aria-label="Choose recovery method"
          title="Back"
          onclick={dismissCreateNew}
          disabled={effectiveDisabled}
        >
          <span class="i-lucide-chevron-left" aria-hidden="true"></span>
        </button>
        <span class="i-lucide-circle-alert" aria-hidden="true"></span>
        <span>{createNewTitle}</span>
      </div>

      {#if createNewDescription}
        <p class="result-description">{createNewDescription}</p>
      {/if}

      {#if error}
        <p class="field-error" id={errorId}>{error}</p>
      {/if}

      {#if onCreateNew}
        <button
          class="create-new-button"
          type="button"
          disabled={!canCreateNew}
          data-testid={createNewTestId}
          onclick={createNew}
        >
          {#if effectiveCreateNewBusy}
            <span class="i-lucide-loader-2 spin" aria-hidden="true"></span>
          {:else}
            <span class="i-lucide-plus" aria-hidden="true"></span>
          {/if}
          <span>{createNewLabel}</span>
        </button>
      {/if}
    </div>
  {:else if !selected}
    <div
      class:column={methodLayout === 'column'}
      class="recovery-methods"
      role="radiogroup"
      aria-label="Recovery method"
    >
      {#each visibleMethods as option (option.id)}
        <button
          type="button"
          aria-pressed="false"
          onclick={() => selectMethod(option.id)}
          disabled={effectiveDisabled}
        >
          <span class={option.icon} aria-hidden="true"></span>
          <span>{option.label}</span>
        </button>
      {/each}
    </div>
    {#if error}
      <p class="field-error" id={errorId}>{error}</p>
    {/if}
  {:else}
    <div class="selected-method">
      <button
        type="button"
        class="method-back"
        aria-label="Choose recovery method"
        title="Back"
        onclick={clearMethod}
        disabled={effectiveDisabled}
      >
        <span class="i-lucide-chevron-left" aria-hidden="true"></span>
      </button>
      {#if selectedOption}
        <span class={selectedOption.icon} aria-hidden="true"></span>
        <span>{selectedOption.label}</span>
      {/if}
    </div>

    {#if selected === 'nsec'}
      <label class="field">
        <span>Secret key</span>
        <input
          type="password"
          value={nsec}
          placeholder="nsec1..."
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          disabled={effectiveDisabled}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          oninput={(event) => (nsec = (event.currentTarget as HTMLInputElement).value)}
        />
      </label>
    {:else if selected === 'seed_phrase'}
      <label class="field">
        <span>Seed phrase</span>
        <textarea
          value={seedWords}
          rows="3"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          disabled={effectiveDisabled}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          oninput={(event) => (seedWords = (event.currentTarget as HTMLTextAreaElement).value)}
        ></textarea>
      </label>
      <label class="field">
        <span>Passphrase</span>
        <input
          type="password"
          value={seedPassphrase}
          autocomplete="off"
          disabled={effectiveDisabled}
          oninput={(event) => (seedPassphrase = (event.currentTarget as HTMLInputElement).value)}
        />
      </label>
    {:else if selected === 'nip46'}
      <label class="field">
        <span>Link device</span>
        <input
          type="text"
          value={nip46Connection}
          placeholder="bunker://... or name@example.com"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          disabled={effectiveDisabled}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          oninput={(event) => (nip46Connection = (event.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label class="field">
        <span>Relay</span>
        <input
          type="url"
          value={nip46Relay}
          placeholder="wss://..."
          autocomplete="off"
          disabled={effectiveDisabled}
          oninput={(event) => (nip46Relay = (event.currentTarget as HTMLInputElement).value)}
        />
      </label>
    {/if}

    {#if selected === 'nip07' && !nostrAvailable}
      <p class="field-error">No extension found</p>
    {/if}

    {#if error}
      <p class="field-error" id={errorId}>{error}</p>
    {/if}

    <button class="submit-button" type="submit" disabled={!canSubmit}>
      {#if effectiveDisabled}
        <span class="i-lucide-loader-2 spin" aria-hidden="true"></span>
      {:else}
        <span class="i-lucide-key-round" aria-hidden="true"></span>
      {/if}
      <span>{submitLabel}</span>
    </button>
  {/if}
</form>

<style>
  .iris-identity-recovery {
    display: grid;
    gap: 12px;
    min-width: 0;
  }

  .recovery-methods {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .recovery-methods.column {
    grid-template-columns: minmax(0, 1fr);
  }

  .recovery-methods button,
  .submit-button,
  .create-new-button,
  .method-back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 0;
    min-height: 42px;
    border: 1px solid var(--control-border, transparent);
    border-radius: 8px;
    background: var(--control-bg, #f5f5f7);
    color: var(--text, #1d1d1f);
    font: inherit;
    font-weight: 720;
    cursor: pointer;
  }

  .recovery-methods button {
    justify-content: flex-start;
    padding: 0 10px;
  }

  .selected-method {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 42px;
    font-weight: 760;
  }

  .recovery-result {
    display: grid;
    gap: 12px;
    min-width: 0;
  }

  .method-back {
    width: 38px;
    min-height: 38px;
    padding: 0;
    border-radius: 999px;
    background: var(--control-hover, #e8e8ed);
  }

  .recovery-methods button span:last-child,
  .submit-button span:last-child,
  .create-new-button span:last-child,
  .selected-method span:last-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recovery-methods button:hover:not(:disabled),
  .submit-button:hover:not(:disabled),
  .create-new-button:hover:not(:disabled),
  .method-back:hover:not(:disabled) {
    background: var(--control-hover, #e8e8ed);
  }

  .field {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .field span {
    color: var(--text-muted, #6e6e73);
    font-size: 0.82rem;
    font-weight: 750;
  }

  .field input,
  .field textarea {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--line, #d2d2d7);
    border-radius: 8px;
    background: var(--surface-raised, #fff);
    color: var(--text, #1d1d1f);
    font: inherit;
    outline: none;
  }

  .field input {
    height: 42px;
    padding: 0 12px;
  }

  .field textarea {
    resize: vertical;
    min-height: 78px;
    padding: 10px 12px;
  }

  .field input:focus,
  .field textarea:focus {
    border-color: var(--accent, #007aff);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #007aff) 18%, transparent);
  }

  .submit-button {
    width: 100%;
    background: var(--accent, #007aff);
    color: var(--accent-contrast, #fff);
  }

  .create-new-button {
    width: 100%;
    background: var(--accent, #007aff);
    color: var(--accent-contrast, #fff);
  }

  .submit-button:disabled,
  .create-new-button:disabled,
  .recovery-methods button:disabled,
  .method-back:disabled {
    cursor: default;
    opacity: 0.62;
  }

  .field-error {
    margin: 0;
    color: var(--danger-text, #d93025);
    font-size: 0.82rem;
    font-weight: 650;
  }

  .result-description {
    margin: 0;
    color: var(--text-muted, #6e6e73);
    font-size: 0.9rem;
    font-weight: 650;
  }

  .spin {
    animation: iris-identity-recovery-spin 0.9s linear infinite;
  }

  @keyframes iris-identity-recovery-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 420px) {
    .recovery-methods {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
