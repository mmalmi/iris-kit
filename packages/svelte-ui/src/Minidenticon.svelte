<script lang="ts">
  import { minidenticon } from 'minidenticons';

  interface Props {
    seed?: string;
    size?: number;
    saturation?: number;
    lightness?: number;
    title?: string;
    alt?: string;
    ariaHidden?: boolean;
    class?: string;
  }

  let {
    seed = '',
    size = 40,
    saturation = 50,
    lightness = 50,
    title = '',
    alt = '',
    ariaHidden = true,
    class: className = '',
  }: Props = $props();

  let svgURI = $derived(`data:image/svg+xml;utf8,${encodeURIComponent(minidenticon(seed || 'iris', saturation, lightness))}`);
</script>

<span
  class={`iris-minidenticon ${className}`.trim()}
  style={`--iris-minidenticon-size:${size}px;`}
  title={title || undefined}
  aria-hidden={ariaHidden ? 'true' : undefined}
>
  <img
    src={svgURI}
    alt={ariaHidden ? '' : alt}
    width={size}
    height={size}
  />
</span>

<style>
  .iris-minidenticon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: var(--iris-minidenticon-size, 40px);
    height: var(--iris-minidenticon-size, 40px);
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 10%, transparent);
  }

  .iris-minidenticon img {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
