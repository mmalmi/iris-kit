<script lang="ts">
  import CopyButton from './CopyButton.svelte';

  interface Props {
    text: string;
    class?: string;
    multiline?: boolean;
    rows?: number;
  }

  let {
    text,
    class: className = '',
    multiline = false,
    rows = 3,
  }: Props = $props();
</script>

<div class={`flex items-stretch gap-2 rounded-xl bg-surface-0 b-1 b-solid b-surface-3 p-1.5 shadow-sm ${className}`.trim()}>
  {#if multiline}
    <textarea
      readonly
      value={text}
      {rows}
      class="flex-1 min-w-0 textarea bg-transparent! b-0! p-2.5 text-xs font-mono leading-5 resize-none"
      onclick={(event) => (event.target as HTMLTextAreaElement).select()}
    ></textarea>
  {:else}
    <input
      type="text"
      readonly
      value={text}
      class="flex-1 min-w-0 input bg-transparent! b-0! rounded-lg! px-2.5 py-2 text-xs font-mono"
      onclick={(event) => (event.target as HTMLInputElement).select()}
    />
  {/if}
  <CopyButton
    {text}
    label=""
    copiedLabel=""
    class="w-10 shrink-0 rounded-lg bg-surface-2 text-text-2 hover:bg-surface-3 hover:text-text-1 transition-colors duration-100 flex items-center justify-center"
    title="Copy"
    copiedTitle="Copied"
    ariaLabel="Copy"
    copiedAriaLabel="Copied"
    iconClass="i-lucide-copy"
    copiedIconClass="i-lucide-check text-success"
  />
</div>
