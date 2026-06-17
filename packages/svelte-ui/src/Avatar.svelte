<script lang="ts">
  import Minidenticon from './Minidenticon.svelte';
  import ProxyImg from './ProxyImg.svelte';
  import type { ImgProxySettingsInput } from './imgproxy';
  import {
    getProfileDisplayName,
    getProfilePicture,
    type IrisProfile,
  } from './profile';

  interface Props {
    pubkey?: string;
    profile?: IrisProfile | null;
    name?: string | null;
    fallbackName?: string | null;
    picture?: string | null;
    size?: number;
    saturation?: number;
    lightness?: number;
    alt?: string | null;
    title?: string | null;
    ariaHidden?: boolean;
    imageClass?: string;
    fallbackClass?: string;
    imgProxy?: ImgProxySettingsInput | false;
    loadOriginalIfProxyFails?: boolean;
    class?: string;
  }

  let {
    pubkey = '',
    profile = undefined,
    name = undefined,
    fallbackName = undefined,
    picture = undefined,
    size = 40,
    saturation = 50,
    lightness = 50,
    alt = undefined,
    title = undefined,
    ariaHidden = true,
    imageClass = '',
    fallbackClass = '',
    imgProxy = undefined,
    loadOriginalIfProxyFails = undefined,
    class: className = '',
  }: Props = $props();

  let imageError = $state(false);
  let lastResetKey = $state('');

  let resolvedPicture = $derived((picture ?? getProfilePicture(profile)).trim());
  let label = $derived(getProfileDisplayName(profile, pubkey, name, fallbackName));

  $effect(() => {
    const resetKey = `${pubkey}\n${resolvedPicture}`;
    if (resetKey !== lastResetKey) {
      lastResetKey = resetKey;
      imageError = false;
    }
  });

</script>

{#if resolvedPicture && !imageError}
  <ProxyImg
    src={resolvedPicture}
    alt={ariaHidden ? '' : (alt ?? label)}
    ariaHidden={ariaHidden}
    title={title ?? label}
    width={size}
    height={size}
    square={true}
    class={`iris-avatar iris-avatar-image ${className} ${imageClass}`.trim()}
    style={`--iris-avatar-size:${size}px;`}
    {imgProxy}
    {loadOriginalIfProxyFails}
    onError={() => (imageError = true)}
  />
{:else}
  <Minidenticon
    seed={pubkey || label}
    {size}
    {saturation}
    {lightness}
    title={title ?? label}
    alt={alt ?? label}
    {ariaHidden}
    class={`iris-avatar ${className} ${fallbackClass}`.trim()}
  />
{/if}

<style>
  .iris-avatar {
    width: var(--iris-avatar-size, 40px);
    height: var(--iris-avatar-size, 40px);
  }

  .iris-avatar-image {
    display: block;
    flex: 0 0 auto;
    border-radius: 999px;
    object-fit: cover;
  }
</style>
