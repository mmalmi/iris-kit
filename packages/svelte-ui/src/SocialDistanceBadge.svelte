<script lang="ts">
  interface Props {
    distance?: number | null;
    followedByFriends?: number | null;
    followedByCount?: number | null;
    muted?: boolean;
    size?: number;
    title?: string;
    class?: string;
    className?: string;
  }

  let {
    distance = null,
    followedByFriends = null,
    followedByCount = null,
    muted = false,
    size = 16,
    title = '',
    class: classValue = '',
    className = '',
  }: Props = $props();

  let normalizedDistance = $derived(normalizeCount(distance));
  let friendCount = $derived(normalizeCount(followedByFriends ?? followedByCount));
  let state = $derived(socialDistanceState(normalizedDistance, friendCount, muted));
  let label = $derived(title || socialDistanceLabel(normalizedDistance, friendCount, muted));
  let style = $derived(`--iris-social-distance-badge-size:${size}px;`);
  let classList = $derived(`iris-social-distance-badge ${classValue} ${className}`.trim());

  function normalizeCount(value: number | null | undefined): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
  }

  function socialDistanceState(
    value: number | null,
    friends: number | null,
    isMuted: boolean,
  ): string {
    if (isMuted) return 'muted';
    if (value === 0) return 'self';
    if (value === 1) return 'following';
    if (value === 2) return friends !== null && friends > 10 ? 'trusted' : 'friend';
    return '';
  }

  function socialDistanceLabel(
    value: number | null,
    friends: number | null,
    isMuted: boolean,
  ): string {
    if (isMuted) return 'Muted';
    if (value === 0) return 'You';
    if (value === 1) return 'Following';
    if (value === 2) {
      return friends !== null
        ? `Followed by ${friends} ${friends === 1 ? 'friend' : 'friends'}`
        : 'Followed by your network';
    }
    return '';
  }
</script>

{#if state}
  <span
    data-testid="social-distance-badge"
    class={classList}
    class:self={state === 'self'}
    class:following={state === 'following'}
    class:friend={state === 'friend'}
    class:trusted={state === 'trusted'}
    class:muted={state === 'muted'}
    {style}
    title={label}
    aria-label={label}
  >
    {#if state === 'muted'}
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 9v6h4l5 5V4L7 9H3Zm14 3 3.2 3.2 1.4-1.4-3.2-3.2 3.2-3.2L20.2 6 17 9.2 13.8 6l-1.4 1.4 3.2 3.2-3.2 3.2 1.4 1.4L17 12Z" />
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9.2 16.4 4.8 12l-1.4 1.4 5.8 5.8L21 7.4 19.6 6 9.2 16.4Z" />
      </svg>
    {/if}
  </span>
{/if}

<style>
  .iris-social-distance-badge {
    display: inline-grid;
    width: var(--iris-social-distance-badge-size, 16px);
    height: var(--iris-social-distance-badge-size, 16px);
    place-items: center;
    flex: 0 0 auto;
    border-radius: 999px;
    background: #8e8e93;
    color: #fff;
    line-height: 1;
  }

  .iris-social-distance-badge.self,
  .iris-social-distance-badge.following {
    background: #0a84ff;
  }

  .iris-social-distance-badge.trusted {
    background: #30d158;
  }

  .iris-social-distance-badge.muted {
    background: #ff453a;
  }

  .iris-social-distance-badge svg {
    width: calc(var(--iris-social-distance-badge-size, 16px) * 0.72);
    height: calc(var(--iris-social-distance-badge-size, 16px) * 0.72);
    fill: currentColor;
  }
</style>
