<script lang="ts">
  import { onDestroy } from 'svelte';
  import { loadImgProxySettings, resolveImgProxyUrl, type ImgProxySettingsInput } from './imgproxy';

  interface Props {
    src: string | null | undefined;
    width?: number;
    height?: number;
    square?: boolean;
    dpr?: number;
    alt?: string;
    title?: string | null;
    ariaHidden?: boolean;
    loading?: 'lazy' | 'eager';
    decoding?: 'async' | 'auto' | 'sync';
    referrerpolicy?: HTMLImageElement['referrerPolicy'];
    imgProxy?: ImgProxySettingsInput | false;
    loadOriginalIfProxyFails?: boolean;
    hideBroken?: boolean;
    loadTimeoutMs?: number;
    class?: string;
    style?: string;
    onLoad?: () => void;
    onError?: () => void;
    onProxyFailed?: () => void;
  }

  let {
    src,
    width = undefined,
    height = undefined,
    square = false,
    dpr = 2,
    alt = '',
    title = null,
    ariaHidden = false,
    loading = 'lazy',
    decoding = 'async',
    referrerpolicy = 'no-referrer',
    imgProxy = undefined,
    loadOriginalIfProxyFails = undefined,
    hideBroken = false,
    loadTimeoutMs = 2_000,
    class: className = '',
    style = '',
    onLoad,
    onError,
    onProxyFailed,
  }: Props = $props();

  let imageSrc = $state('');
  let loadFailed = $state(false);
  let proxyFailed = $state(false);
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let lastSourceKey = $state('');

  const originalSrc = $derived((src ?? '').trim());
  const effectiveLoading = $derived(shouldLoadEagerly(imageSrc) ? 'eager' : loading);

  $effect(() => {
    const sourceKey = `${originalSrc}\n${width ?? ''}x${height ?? ''}\n${square}\n${dpr}\n${JSON.stringify(imgProxy ?? null)}`;
    if (sourceKey !== lastSourceKey) {
      lastSourceKey = sourceKey;
      loadFailed = false;
      proxyFailed = false;
    }
  });

  $effect(() => {
    let cancelled = false;
    imageSrc = '';
    clearLoadTimeout();
    if (!originalSrc || loadFailed) return;

    if (proxyFailed) {
      imageSrc = originalSrc;
      return;
    }

    void resolveImgProxyUrl(originalSrc, {
      width,
      height,
      square,
      dpr,
    }, imgProxy).then((url) => {
      if (!cancelled) imageSrc = url;
    });

    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    clearLoadTimeout();
    if (!imageSrc || loadFailed || proxyFailed || loadTimeoutMs <= 0) return;
    timeout = setTimeout(() => handleImageError(), loadTimeoutMs);
    return clearLoadTimeout;
  });

  function handleImageLoad(): void {
    clearLoadTimeout();
    onLoad?.();
  }

  function handleImageError(): void {
    clearLoadTimeout();
    if (!proxyFailed && imageSrc !== originalSrc) {
      onProxyFailed?.();
      if (loadOriginalIfProxyFails ?? shouldFallbackToOriginal(imgProxy)) {
        proxyFailed = true;
        imageSrc = originalSrc;
        return;
      }
    }

    loadFailed = true;
    if (hideBroken) imageSrc = '';
    onError?.();
  }

  function clearLoadTimeout(): void {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  }

  onDestroy(clearLoadTimeout);

  function shouldLoadEagerly(value: string): boolean {
    return value.startsWith('data:') || value.startsWith('blob:');
  }

  function shouldFallbackToOriginal(settings: ImgProxySettingsInput | false): boolean {
    if (settings === false) return false;
    return settings?.fallbackToOriginal ?? loadImgProxySettings().fallbackToOriginal;
  }
</script>

{#if imageSrc && !loadFailed}
  <img
    src={imageSrc}
    {alt}
    aria-hidden={ariaHidden ? 'true' : undefined}
    title={title ?? undefined}
    {width}
    {height}
    class={className || undefined}
    style={style || undefined}
    loading={effectiveLoading}
    {decoding}
    {referrerpolicy}
    onload={handleImageLoad}
    onerror={handleImageError}
  />
{/if}
