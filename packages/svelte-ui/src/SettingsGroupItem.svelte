<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    href?: string;
    active?: boolean;
    isLast?: boolean;
    variant?: 'default' | 'navigation';
    disabled?: boolean;
    ariaLabel?: string;
    ariaPressed?: boolean;
    testId?: string;
    class?: string;
    onclick?: (event: MouseEvent) => void;
    children: Snippet;
  }

  let {
    href = '',
    active = false,
    isLast = false,
    variant = 'default',
    disabled = false,
    ariaLabel = undefined,
    ariaPressed = undefined,
    testId = '',
    class: className = '',
    onclick = undefined,
    children,
  }: Props = $props();

  let rowClass = $derived([
    'iris-settings-group-item',
    variant === 'navigation' ? 'iris-settings-group-item-navigation' : 'iris-settings-group-item-default',
    active ? 'iris-settings-group-item-active' : '',
    isLast ? 'iris-settings-group-item-last' : '',
    disabled ? 'iris-settings-group-item-disabled' : '',
    className,
  ].filter(Boolean).join(' '));
</script>

{#if href}
  <a
    class={rowClass}
    {href}
    aria-current={active ? 'page' : undefined}
    aria-label={ariaLabel}
    data-testid={testId || undefined}
    {onclick}
  >
    {@render children()}
  </a>
{:else if onclick}
  <button
    class={rowClass}
    type="button"
    {disabled}
    aria-label={ariaLabel}
    aria-pressed={ariaPressed}
    data-testid={testId || undefined}
    {onclick}
  >
    {@render children()}
  </button>
{:else}
  <div class={rowClass} aria-label={ariaLabel} data-testid={testId || undefined}>
    {@render children()}
  </div>
{/if}

<style>
  .iris-settings-group-item {
    position: relative;
    box-sizing: border-box;
    display: block;
    width: 100%;
    min-width: 0;
    min-height: 2.5rem;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    line-height: 1.25rem;
    text-align: left;
    text-decoration: none;
    transition: background-color 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .iris-settings-group-item-default {
    padding: 0.625rem 1rem;
  }

  .iris-settings-group-item-navigation {
    padding: 0.5rem 1rem;
  }

  a.iris-settings-group-item,
  button.iris-settings-group-item {
    cursor: pointer;
  }

  a.iris-settings-group-item:hover,
  button.iris-settings-group-item:hover:not(:disabled) {
    background: var(--iris-settings-row-hover, color-mix(in srgb, currentColor 5%, transparent));
  }

  .iris-settings-group-item-active {
    background: var(--iris-settings-row-active, color-mix(in srgb, currentColor 8%, transparent));
  }

  .iris-settings-group-item:not(.iris-settings-group-item-last)::after {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 1rem;
    height: 1px;
    background: var(--iris-settings-divider, color-mix(in srgb, currentColor 15%, transparent));
    content: '';
    pointer-events: none;
  }

  .iris-settings-group-item:focus-visible {
    z-index: 1;
    outline: 2px solid var(--iris-settings-focus, currentColor);
    outline-offset: -2px;
  }

  .iris-settings-group-item-disabled {
    cursor: default;
    opacity: 0.5;
  }
</style>
