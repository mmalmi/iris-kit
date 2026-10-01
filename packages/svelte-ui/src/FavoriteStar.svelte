<script lang="ts">
  let { favorite = false }: { favorite?: boolean } = $props();
</script>

{#if favorite}<span class="iris-favorite-star" title="Favorite · Only you can see this" aria-label="Favorite · Only you can see this">★</span>{/if}

<style>
  .iris-favorite-star { color: #e2a51d; display: inline-block; margin-left: 0.2em; }
</style>
