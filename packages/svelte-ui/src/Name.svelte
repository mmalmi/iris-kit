<script lang="ts">
  import {
    getProfileDisplayName,
    hasExplicitProfileName,
    type IrisProfile,
  } from './profile';

  interface Props {
    pubkey?: string;
    profile?: IrisProfile | null;
    name?: string | null;
    fallbackName?: string | null;
    fallbackClass?: string;
    testId?: string;
    class?: string;
  }

  let {
    pubkey = '',
    profile = undefined,
    name = undefined,
    fallbackName = undefined,
    fallbackClass = 'iris-identity-name-fallback',
    testId = '',
    class: className = '',
  }: Props = $props();

  let label = $derived(getProfileDisplayName(profile, pubkey, name, fallbackName));
  let explicitName = $derived(hasExplicitProfileName(profile, name));
</script>

<span
  class={`iris-identity-name ${explicitName ? '' : fallbackClass} ${className}`.trim()}
  data-testid={testId || undefined}
>{label}</span>

<style>
  .iris-identity-name {
    display: inline-block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .iris-identity-name-fallback {
    font-style: italic;
    opacity: 0.72;
  }
</style>
