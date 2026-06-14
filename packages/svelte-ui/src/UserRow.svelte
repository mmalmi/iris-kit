<script lang="ts">
  import Avatar from './Avatar.svelte';
  import Name from './Name.svelte';
  import type { IrisProfile } from './profile';

  interface Props {
    pubkey?: string;
    profile?: IrisProfile | null;
    name?: string | null;
    fallbackName?: string | null;
    picture?: string | null;
    description?: string;
    href?: string;
    target?: string;
    rel?: string;
    avatarSize?: number;
    avatarClass?: string;
    nameClass?: string;
    descriptionClass?: string;
    fallbackNameClass?: string;
    testId?: string;
    stopPropagation?: boolean;
    class?: string;
  }

  let {
    pubkey = '',
    profile = undefined,
    name = undefined,
    fallbackName = undefined,
    picture = undefined,
    description = '',
    href = '',
    target = undefined,
    rel = undefined,
    avatarSize = 36,
    avatarClass = '',
    nameClass = '',
    descriptionClass = '',
    fallbackNameClass = 'iris-identity-name-fallback',
    testId = '',
    stopPropagation = false,
    class: className = '',
  }: Props = $props();

  function handleInteraction(event: MouseEvent | KeyboardEvent): void {
    if (stopPropagation) {
      event.stopPropagation();
    }
  }
</script>

{#if href}
  <a
    class={`iris-user-row ${className}`.trim()}
    href={href}
    target={target}
    rel={rel}
    data-testid={testId || undefined}
    style={`--iris-user-row-avatar-size:${avatarSize}px;`}
    onclick={handleInteraction}
    onkeydown={handleInteraction}
  >
    <Avatar {pubkey} {profile} {name} {fallbackName} {picture} size={avatarSize} class={avatarClass} />
    <span class="iris-user-row-text">
      <Name {pubkey} {profile} {name} {fallbackName} class={nameClass} fallbackClass={fallbackNameClass} />
      {#if description}
        <span class={`iris-user-row-description ${descriptionClass}`.trim()}>{description}</span>
      {/if}
    </span>
  </a>
{:else}
  <div
    class={`iris-user-row iris-user-row-static ${className}`.trim()}
    data-testid={testId || undefined}
    style={`--iris-user-row-avatar-size:${avatarSize}px;`}
  >
    <Avatar {pubkey} {profile} {name} {fallbackName} {picture} size={avatarSize} class={avatarClass} />
    <span class="iris-user-row-text">
      <Name {pubkey} {profile} {name} {fallbackName} class={nameClass} fallbackClass={fallbackNameClass} />
      {#if description}
        <span class={`iris-user-row-description ${descriptionClass}`.trim()}>{description}</span>
      {/if}
    </span>
  </div>
{/if}

<style>
  .iris-user-row {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
    min-width: 0;
    min-height: var(--iris-user-row-avatar-size, 36px);
    color: inherit;
    line-height: 1;
    text-decoration: none;
  }

  .iris-user-row-text {
    display: inline-flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    gap: 0.2rem;
  }

  .iris-user-row-description {
    display: block;
    min-width: 0;
    overflow: hidden;
    color: color-mix(in srgb, currentColor 64%, transparent);
    font-size: 0.75rem;
    line-height: 1.1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
