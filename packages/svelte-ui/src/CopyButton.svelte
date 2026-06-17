<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    clearCopyReset,
    copyToClipboard,
    DEFAULT_COPY_RESET_MS,
    scheduleCopyReset,
    type CopyResetTimer,
    type CopyResult,
  } from './clipboard';

  type CopyButtonStatus = 'idle' | Exclude<CopyResult, 'failed'>;

  interface Props {
    text: string | null | undefined;
    label?: string;
    copiedLabel?: string;
    promptedLabel?: string;
    title?: string;
    copiedTitle?: string;
    promptedTitle?: string;
    ariaLabel?: string;
    copiedAriaLabel?: string;
    promptedAriaLabel?: string;
    class?: string;
    copiedClass?: string;
    promptedClass?: string;
    iconClass?: string;
    copiedIconClass?: string;
    promptedIconClass?: string;
    labelClass?: string;
    testId?: string;
    disabled?: boolean;
    resetMs?: number;
    promptLabel?: string;
    stopPropagation?: boolean;
    preventDefault?: boolean;
    onBeforeCopy?: () => void;
    onCopied?: () => void;
    onPrompted?: () => void;
    onCopyFailed?: () => void;
  }

  let {
    text,
    label = 'Copy',
    copiedLabel = 'Copied',
    promptedLabel = 'Ready',
    title = label,
    copiedTitle = copiedLabel,
    promptedTitle = promptedLabel,
    ariaLabel = title,
    copiedAriaLabel = copiedTitle,
    promptedAriaLabel = promptedTitle,
    class: className = '',
    copiedClass = '',
    promptedClass = '',
    iconClass = '',
    copiedIconClass = '',
    promptedIconClass = copiedIconClass,
    labelClass = '',
    testId = '',
    disabled = false,
    resetMs = DEFAULT_COPY_RESET_MS,
    promptLabel = '',
    stopPropagation = false,
    preventDefault = false,
    onBeforeCopy,
    onCopied,
    onPrompted,
    onCopyFailed,
  }: Props = $props();

  let copyStatus = $state<CopyButtonStatus>('idle');
  let resetTimer: CopyResetTimer = null;
  const isIdle = $derived(copyStatus === 'idle');
  const stateClass = $derived(copyStatus === 'copied' ? copiedClass : copyStatus === 'prompted' ? promptedClass : '');
  const currentIconClass = $derived(copyStatus === 'copied' ? copiedIconClass : copyStatus === 'prompted' ? promptedIconClass : iconClass);
  const currentLabel = $derived(copyStatus === 'copied' ? copiedLabel : copyStatus === 'prompted' ? promptedLabel : label);
  const currentTitle = $derived(copyStatus === 'copied' ? copiedTitle : copyStatus === 'prompted' ? promptedTitle : title);
  const currentAriaLabel = $derived(copyStatus === 'copied' ? copiedAriaLabel : copyStatus === 'prompted' ? promptedAriaLabel : ariaLabel);

  function resetCopyStatus(): void {
    copyStatus = 'idle';
    resetTimer = null;
  }

  function markCopyStatus(nextStatus: Exclude<CopyResult, 'failed'>): void {
    copyStatus = nextStatus;
    resetTimer = scheduleCopyReset(resetTimer, resetCopyStatus, resetMs);
  }

  async function handleClick(event: MouseEvent): Promise<void> {
    if (preventDefault) {
      event.preventDefault();
    }
    if (stopPropagation) {
      event.stopPropagation();
    }
    if (disabled) return;

    onBeforeCopy?.();
    const result = await copyToClipboard(text, { promptLabel });
    if (result === 'copied') {
      markCopyStatus(result);
      onCopied?.();
    } else if (result === 'prompted') {
      markCopyStatus(result);
      onPrompted?.();
    } else {
      onCopyFailed?.();
    }
  }

  onDestroy(() => {
    clearCopyReset(resetTimer);
  });
</script>

<button
  type="button"
  class={`${className} ${stateClass}`.trim()}
  title={currentTitle}
  aria-label={currentAriaLabel}
  aria-live={isIdle ? undefined : 'polite'}
  data-copy-state={copyStatus}
  data-state={copyStatus === 'prompted' ? 'ready' : copyStatus}
  data-testid={testId || undefined}
  {disabled}
  onclick={(event) => void handleClick(event)}
>
  {#if currentIconClass}
    <span class={currentIconClass} aria-hidden="true"></span>
  {/if}
  {#if currentLabel}
    <span class={labelClass}>{currentLabel}</span>
  {/if}
</button>
