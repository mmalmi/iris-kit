<script module lang="ts">
  export interface SettingsProfile {
    id: string;
    publicKey: string;
    name?: string;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import SettingsGroup from './SettingsGroup.svelte';

  type Action = (profileId: string) => void | Promise<void>;

  interface Props {
    profiles: readonly SettingsProfile[];
    activeProfileId: string | null;
    onSignOut?: Action;
    onSwitchProfile?: Action;
    onRemoveProfile?: Action;
    onCopySecretKey?: Action;
    signInHref?: string;
    onSignIn?: () => void | Promise<void>;
    manageProfilesHref?: string;
    profileName?: Snippet<[SettingsProfile]>;
    profileAvatar?: Snippet<[SettingsProfile]>;
    children?: Snippet;
  }

  let {
    profiles, activeProfileId, onSignOut, onSwitchProfile, onRemoveProfile, onCopySecretKey,
    signInHref, onSignIn, manageProfilesHref, profileName, profileAvatar, children,
  }: Props = $props();

  const activeProfile = $derived(profiles.find(profile => profile.id === activeProfileId));
  let pending = $state(false);
  let feedback = $state<{ profileId: string | null; message: string; error: boolean } | null>(null);

  async function run(action: () => void | Promise<void>, failure: string, success?: string) {
    if (pending) return;
    const profileId = activeProfileId;
    pending = true;
    feedback = null;
    try {
      await action();
      if (success) feedback = { profileId, message: success, error: false };
    } catch {
      feedback = { profileId, message: failure, error: true };
    } finally {
      pending = false;
    }
  }
</script>

<SettingsGroup ariaLabel="Profiles on this device">
  <div class="profile-panel">
    {#if !activeProfile}
      <p class="muted">You’re signed out.</p>
    {/if}
    {#if profiles.length}
      <ul class="profile-list">
        {#each profiles as profile (profile.id)}
          {@const active = profile.id === activeProfileId}
          {@const name = profile.name || 'Profile'}
          <li>
            <div class="profile-row">
              {@render profileAvatar?.(profile)}
              <div class="profile-text">
                <strong>{#if profileName}{@render profileName(profile)}{:else}{name}{/if}</strong>
                <span class="profile-id muted" title={profile.publicKey}>{profile.publicKey}</span>
              </div>
              <span class="profile-state muted">{active ? 'Signed in' : 'Saved'}</span>
            </div>
            {#if !active && (onSwitchProfile || onRemoveProfile)}
              <div class="actions">
                {#if onSwitchProfile}
                  <button type="button" disabled={pending} onclick={() => run(
                    () => onSwitchProfile?.(profile.id), 'Could not switch profiles.',
                  )}>Use profile</button>
                {/if}
                {#if onRemoveProfile}
                  <button type="button" disabled={pending} onclick={() => run(
                    () => onRemoveProfile?.(profile.id), 'Could not remove this profile.',
                  )}>Remove</button>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <div class="actions">
      {#if activeProfile}
        <button type="button" disabled={pending} onclick={() => run(
          () => navigator.clipboard.writeText(activeProfile.publicKey),
          'Could not copy the profile ID.', 'Profile ID copied.',
        )}>Copy profile ID</button>
        {#if onCopySecretKey}
          <button type="button" disabled={pending} onclick={() => run(
            () => onCopySecretKey?.(activeProfile.id),
            'Could not copy the secret key.', 'Secret key copied.',
          )}>Copy secret key</button>
        {/if}
        {#if onSignOut}
          <button type="button" disabled={pending} onclick={() => run(
            () => onSignOut?.(activeProfile.id), 'Could not sign out.',
          )}>Sign out</button>
        {/if}
      {:else if signInHref}
        <a href={signInHref}>Sign in</a>
      {:else if onSignIn}
        <button type="button" disabled={pending} onclick={() => run(
          () => onSignIn?.(), 'Could not open sign-in.',
        )}>Sign in</button>
      {/if}
      {#if manageProfilesHref}
        <a href={manageProfilesHref}>Manage profiles</a>
      {/if}
    </div>
    {#if feedback && feedback.profileId === activeProfileId}
      <p role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>
    {/if}
    {@render children?.()}
  </div>
</SettingsGroup>

<style>
  .profile-panel {
    display: grid;
    gap: 0.875rem;
    padding: 1rem;
  }

  .profile-panel :where(p, ul) {
    margin: 0;
  }

  .profile-list {
    display: grid;
    gap: 0.75rem;
    padding: 0;
    list-style: none;
  }

  .profile-list li {
    min-width: 0;
    padding-block-end: 0.75rem;
    border-bottom: 1px solid var(--iris-settings-divider, color-mix(in srgb, currentColor 14%, transparent));
  }

  .profile-row, .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .profile-text {
    flex: 1;
    min-width: 0;
  }

  .profile-id {
    display: block;
    overflow: hidden;
    font: 0.8rem ui-monospace, monospace;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .muted {
    color: var(--iris-settings-muted, color-mix(in srgb, currentColor 74%, transparent));
  }

  .profile-state {
    font-size: 0.875rem;
  }

  .actions {
    flex-wrap: wrap;
  }

  li .actions {
    margin-top: 0.5rem;
  }

  .actions :where(button, a) {
    min-height: 2.5rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--iris-settings-divider, color-mix(in srgb, currentColor 20%, transparent));
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    font: inherit;
    line-height: 1.3;
    text-decoration: none;
    cursor: pointer;
  }

  .actions button:disabled {
    opacity: 0.6;
    cursor: wait;
  }
</style>
