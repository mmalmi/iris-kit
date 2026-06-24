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
    onMethodChange?: (method: IdentityRecoveryMethod) => void;
    onSubmit?: (request: IdentityRecoveryRequest) => void | Promise<void>;
    class?: string;
  }

  let {
    method = 'nsec',
    methodLayout = 'grid',
    disabled = false,
    submitLabel = 'Continue',
    error = '',
    nostrAvailable = true,
    onMethodChange = undefined,
    onSubmit = undefined,
    class: className = '',
  }: Props = $props();

  let selected = $state<IdentityRecoveryMethod>(method);
  let nsec = $state('');
  let seedWords = $state('');
  let seedPassphrase = $state('');
  let nip46Connection = $state('');
  let nip46Relay = $state('');

  const errorId = `iris-identity-recovery-${Math.random().toString(36).slice(2)}-error`;
  const request = $derived<IdentityRecoveryRequest>({
    method: selected,
    ...(nsec ? { nsec } : {}),
    ...(seedWords ? { seedWords } : {}),
    ...(seedPassphrase ? { seedPassphrase } : {}),
    ...(nip46Connection ? { nip46Connection } : {}),
    ...(nip46Relay ? { nip46Relay } : {}),
  });
  const canSubmit = $derived(
    !disabled
      && (selected !== 'nip07' || nostrAvailable)
      && identityRecoveryRequestHasInput(request),
  );

  $effect(() => {
    if (method !== selected) selected = method;
  });

  function selectMethod(nextMethod: IdentityRecoveryMethod): void {
    selected = nextMethod;
    onMethodChange?.(nextMethod);
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) return;
    await onSubmit?.(normalizeIdentityRecoveryRequest(request));
  }
</script>

<form class={`iris-identity-recovery ${className}`.trim()} onsubmit={submit}>
  <div
    class:column={methodLayout === 'column'}
    class="recovery-methods"
    role="radiogroup"
    aria-label="Recovery method"
  >
    {#each IDENTITY_RECOVERY_METHODS as option (option.id)}
      <button
        type="button"
        class:active={selected === option.id}
        aria-pressed={selected === option.id}
        onclick={() => selectMethod(option.id)}
        disabled={disabled}
      >
        <span class={option.icon} aria-hidden="true"></span>
        <span>{option.label}</span>
      </button>
    {/each}
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
        disabled={disabled}
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
        disabled={disabled}
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
        disabled={disabled}
        oninput={(event) => (seedPassphrase = (event.currentTarget as HTMLInputElement).value)}
      />
    </label>
  {:else if selected === 'nip46'}
    <label class="field">
      <span>Remote signer</span>
      <input
        type="text"
        value={nip46Connection}
        placeholder="bunker://... or name@example.com"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        disabled={disabled}
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
        disabled={disabled}
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
    {#if disabled}
      <span class="i-lucide-loader-2 spin" aria-hidden="true"></span>
    {:else}
      <span class="i-lucide-key-round" aria-hidden="true"></span>
    {/if}
    <span>{submitLabel}</span>
  </button>
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
  .submit-button {
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

  .recovery-methods button span:last-child,
  .submit-button span:last-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recovery-methods button:hover:not(:disabled),
  .submit-button:hover:not(:disabled) {
    background: var(--control-hover, #e8e8ed);
  }

  .recovery-methods button.active {
    border-color: var(--accent, #007aff);
    background: var(--control-selected-bg, #e8f2ff);
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

  .submit-button:disabled,
  .recovery-methods button:disabled {
    cursor: default;
    opacity: 0.62;
  }

  .field-error {
    margin: 0;
    color: var(--danger-text, #d93025);
    font-size: 0.82rem;
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
