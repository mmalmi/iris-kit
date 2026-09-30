<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    ariaLabel?: string;
    testId?: string;
    class?: string;
    children: Snippet;
  }

  let {
    title = '',
    ariaLabel = undefined,
    testId = '',
    class: className = '',
    children,
  }: Props = $props();
</script>

<section class={`iris-settings-group ${className}`.trim()} data-testid={testId || undefined}>
  {#if title}
    <h2 class="iris-settings-group-title">{title}</h2>
  {/if}
  <div class="iris-settings-group-surface" aria-label={ariaLabel}>{@render children()}</div>
</section>

<style>
  .iris-settings-group {
    min-width: 0;
  }

  .iris-settings-group-title {
    margin: 0 0 0.75rem;
    padding: 0 0.75rem;
    color: var(--iris-settings-muted, color-mix(in srgb, currentColor 70%, transparent));
    font-size: 14px;
    font-weight: 600;
    line-height: 1.25rem;
    letter-spacing: 0.025em;
    text-transform: uppercase;
  }

  .iris-settings-group-surface {
    min-width: 0;
    overflow: hidden;
    border-radius: 0.75rem;
    background: var(--iris-settings-surface, var(--surface, #fff));
    box-shadow: var(--iris-settings-shadow, 0 1px 2px rgb(0 0 0 / 0.05));
  }
</style>
