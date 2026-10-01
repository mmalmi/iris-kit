<script lang="ts">
  import { emptyContactMemory, pendingContactName, type ContactMemory } from './contactMemory';

  interface Props {
    memory?: ContactMemory | null;
    currentName?: string | null;
    onFavoriteChange: (favorite: boolean) => void | Promise<void>;
    onApproveName: (expectedName: string) => void | Promise<void>;
  }

  let { memory = null, currentName = null, onFavoriteChange, onApproveName }: Props = $props();
  let pending = $derived(pendingContactName(memory ?? emptyContactMemory(), currentName));
  let error = $state('');
  let busy = $state(false);

  function dateLabel(seconds: number) {
    const date = new Date(seconds * 1000);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : '';
  }

  async function run(action: () => void | Promise<void>) {
    error = '';
    busy = true;
    try { await action(); } catch { error = 'Could not save. Try again.'; }
    finally { busy = false; }
  }
</script>

<div class="iris-contact-memory">
  <button
    type="button"
    class="iris-contact-favorite"
    aria-pressed={memory?.favorite ?? false}
    title="Only you can see this"
    disabled={busy}
    onclick={() => run(() => onFavoriteChange(!memory?.favorite))}
  ><span aria-hidden="true">{memory?.favorite ? '★' : '☆'}</span> {memory?.favorite ? 'Favorited' : 'Favorite'}</button>
  <span class="iris-contact-private">Only you can see this</span>
  {#if pending}
    <p class="iris-contact-name-change">
      New name: <strong>{pending}</strong>
      <button type="button" disabled={busy} onclick={() => {
        const expected = pending;
        if (expected) void run(() => onApproveName(expected));
      }}>Use this name</button>
    </p>
  {/if}
  {#if memory?.name_changes.length}
    <details class="iris-contact-history">
      <summary>Name history</summary>
      <ul>
        {#each memory.name_changes as change}
          <li>{change.previous_name} → {change.accepted_name} <span class="iris-contact-date">{dateLabel(change.accepted_at_secs)}</span></li>
        {/each}
      </ul>
    </details>
  {/if}
  {#if error}<p role="alert">{error}</p>{/if}
</div>

<style>
  .iris-contact-memory { margin-top: 0.75rem; font-size: 0.875rem; }
  button { color: inherit; cursor: pointer; background: transparent; border: 1px solid currentColor; border-radius: 0.5rem; padding: 0.35rem 0.6rem; font: inherit; }
  button:disabled { opacity: 0.5; cursor: default; }
  .iris-contact-favorite[aria-pressed='true'] span { color: #e2a51d; }
  .iris-contact-private { opacity: 0.65; margin-left: 0.5rem; font-size: 0.8rem; }
  .iris-contact-name-change { display: flex; align-items: center; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.65rem; }
  .iris-contact-name-change strong { overflow-wrap: anywhere; }
  .iris-contact-history { margin-top: 0.65rem; }
  summary { cursor: pointer; opacity: 0.7; }
  ul { padding-left: 1rem; }
  li { overflow-wrap: anywhere; }
  .iris-contact-date { opacity: 0.65; margin-left: 0.35rem; font-size: 0.8rem; }
</style>
