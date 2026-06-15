<script lang="ts">
  interface Props {
    href?: string;
    label?: string;
  }

  let { href = '#/settings', label = 'Settings' }: Props = $props();
</script>

<a
  {href}
  class="btn-circle btn-ghost inline-flex items-center justify-center no-underline shrink-0"
  title={label}
  aria-label={label}
  data-testid="header-settings-link"
>
  <span class="i-lucide-settings text-lg"></span>
</a>
