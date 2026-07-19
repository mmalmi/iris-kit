<script lang="ts">
  import Avatar from './Avatar.svelte';
  import type { AvatarGroupItem } from './avatarGroup';

  interface Props {
    items?: readonly AvatarGroupItem[];
    size?: number;
    overlap?: number;
    max?: number;
    ariaLabel?: string;
    class?: string;
  }

  let {
    items = [],
    size = 30,
    overlap = 8,
    max = 3,
    ariaLabel = 'Profile avatars',
    class: className = '',
  }: Props = $props();

  let normalizedSize = $derived(Math.max(12, Math.round(size)));
  let normalizedOverlap = $derived(Math.max(0, Math.min(Math.round(overlap), normalizedSize - 1)));
  let normalizedMax = $derived(Math.max(0, Math.floor(max)));
  let visibleItems = $derived(items.slice(0, normalizedMax));
</script>

<div
  class={`iris-avatar-group ${className}`.trim()}
  role="group"
  aria-label={ariaLabel}
  style="display:flex;align-items:center;overflow:visible;"
>
  {#each visibleItems as item, index (item.pubkey)}
    <div
      class="iris-avatar-group-item"
      style={`position:relative;display:flex;flex:0 0 auto;margin-left:${index === 0 ? 0 : -normalizedOverlap}px;z-index:${visibleItems.length - index};`}
    >
      {#if item.href}
        <a
          href={item.href}
          aria-label={item.label ?? undefined}
          title={item.label ?? undefined}
          style="display:block;border-radius:999px;"
        >
          <Avatar
            pubkey={item.pubkey}
            profile={item.profile}
            name={item.name}
            picture={item.picture}
            size={normalizedSize}
            ariaHidden={true}
            class="iris-avatar-group-avatar"
          />
        </a>
      {:else}
        <Avatar
          pubkey={item.pubkey}
          profile={item.profile}
          name={item.name}
          picture={item.picture}
          size={normalizedSize}
          ariaHidden={true}
          title={item.label}
          class="iris-avatar-group-avatar"
        />
      {/if}
    </div>
  {/each}
</div>

<style>
  :global(.iris-avatar-group-avatar) {
    box-sizing: border-box;
    border: 2px solid rgb(var(--iris-surface-rgb, 0 0 0));
  }

  .iris-avatar-group-item a:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }
</style>
