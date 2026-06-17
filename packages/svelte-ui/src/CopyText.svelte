<script lang="ts">
  import CopyButton from './CopyButton.svelte';
  import { truncateMiddle } from './clipboard';

  interface Props {
    text: string;
    displayText?: string;
    truncate?: number;
    class?: string;
    testId?: string;
  }

  let { text, displayText, truncate, class: className = '', testId }: Props = $props();

  let display = $derived(truncateMiddle(displayText ?? text, truncate));
</script>

<CopyButton
  {text}
  label={display}
  copiedLabel={display}
  title="Copy"
  copiedTitle="Copied"
  ariaLabel="Copy"
  copiedAriaLabel="Copied"
  class={`inline text-text-2 hover:text-text-1 bg-transparent border-none cursor-pointer p-0 text-left ${className}`.trim()}
  iconClass="i-lucide-copy text-xs mr-1 inline-block align-middle"
  copiedIconClass="i-lucide-check text-success text-xs mr-1 inline-block align-middle"
  labelClass="font-mono break-all"
  {testId}
/>
