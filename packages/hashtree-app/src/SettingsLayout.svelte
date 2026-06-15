<script lang="ts">
  import type { Component } from 'svelte';

  type TabId = 'app' | 'storage' | 'traffic' | 'servers' | 'p2p';
  type SettingsPanel = Component<Record<string, never>>;
  type EmbeddedSettingsPanel = Component<{ embedded?: boolean }>;

  interface Props {
    currentPath: string;
    navigate: (path: string) => void;
    appSettings: SettingsPanel;
    storageSettings: SettingsPanel;
    trafficSettings: EmbeddedSettingsPanel;
    serversSettings: EmbeddedSettingsPanel;
    p2pSettings: EmbeddedSettingsPanel;
  }

  let {
    currentPath,
    navigate,
    appSettings: AppSettings,
    storageSettings: StorageSettings,
    trafficSettings: TransportUsageSettings,
    serversSettings: ServersSettings,
    p2pSettings: P2PSettings,
  }: Props = $props();

  const tabs = [
    {
      id: 'app',
      label: 'App',
      icon: 'i-lucide-settings-2',
      description: 'Account tools, build info, and refresh actions.',
      activeRowClass: 'bg-accent/8',
      iconFrameClass: 'bg-accent/12 text-accent ring-1 ring-accent/20',
    },
    {
      id: 'storage',
      label: 'Storage',
      icon: 'i-lucide-hard-drive',
      description: 'Cache limits, local storage, and republish tools.',
      activeRowClass: 'bg-amber-500/10',
      iconFrameClass: 'bg-amber-500/12 text-amber-500 ring-1 ring-amber-500/20',
    },
    {
      id: 'traffic',
      label: 'Traffic',
      icon: 'i-lucide-activity',
      description: 'Transferred totals grouped by transport.',
      activeRowClass: 'bg-sky-500/8',
      iconFrameClass: 'bg-sky-500/12 text-sky-500 ring-1 ring-sky-500/20',
    },
    {
      id: 'servers',
      label: 'Servers',
      icon: 'i-lucide-server',
      description: 'Relays and Blossom endpoints.',
      activeRowClass: 'bg-emerald-500/8',
      iconFrameClass: 'bg-emerald-500/12 text-emerald-500 ring-1 ring-emerald-500/20',
    },
    {
      id: 'p2p',
      label: 'P2P',
      icon: 'i-lucide-radio-tower',
      description: 'Connection pools and mesh peers.',
      activeRowClass: 'bg-violet-500/8',
      iconFrameClass: 'bg-violet-500/12 text-violet-500 ring-1 ring-violet-500/20',
    },
  ] as const satisfies ReadonlyArray<{
    id: TabId;
    label: string;
    icon: string;
    description: string;
    activeRowClass: string;
    iconFrameClass: string;
  }>;

  const DEFAULT_TAB: TabId = 'app';

  function selectTab(id: TabId) {
    navigate(`/settings/${id}`);
  }

  function openSettingsIndex() {
    navigate('/settings');
  }

  let activeTab = $derived.by((): TabId => {
    const path = currentPath;
    if (path === '/settings') return DEFAULT_TAB;
    if (path.startsWith('/settings/storage')) return 'storage';
    if (path.startsWith('/settings/traffic')) return 'traffic';
    if (path.startsWith('/settings/network/traffic')) return 'traffic';
    if (path === '/settings/network') return 'traffic';
    if (path.startsWith('/settings/app')) return 'app';
    if (path.startsWith('/settings/servers')) return 'servers';
    if (path.startsWith('/settings/network/servers')) return 'servers';
    if (path.startsWith('/settings/p2p')) return 'p2p';
    if (path.startsWith('/settings/network/p2p')) return 'p2p';
    return DEFAULT_TAB;
  });

  let isSettingsRootRoute = $derived(currentPath === '/settings');
  let activeItem = $derived(tabs.find((tab) => tab.id === activeTab) ?? tabs[0]);
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-1 lg:flex-row">
  <aside
    class={`min-h-0 shrink-0 overflow-auto border-b border-surface-2 bg-surface-1 lg:w-[22rem] lg:border-b-0 lg:border-r ${isSettingsRootRoute ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'}`}
  >
    <div class="w-full px-4 pb-8 pt-6 lg:px-5 lg:py-6">
      <div class="mb-6">
        <h1 class="text-2xl font-semibold text-text-1">Settings</h1>
      </div>

      <div class="overflow-hidden rounded-2xl bg-surface-2 shadow-sm ring-1 ring-surface-3/80">
        {#each tabs as item, index (item.id)}
          <button
            data-testid={`settings-nav-${item.id}`}
            onclick={() => selectTab(item.id)}
            aria-current={activeTab === item.id ? 'page' : undefined}
            class={`relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${activeTab === item.id ? item.activeRowClass : 'hover:bg-surface-3/40'}`}
          >
            <span class={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.iconFrameClass}`}>
              <span class={item.icon}></span>
            </span>
            <span class="min-w-0 flex-1 text-sm font-medium text-text-1">{item.label}</span>
            <span class="i-lucide-chevron-right shrink-0 text-base text-text-3"></span>
            {#if index < tabs.length - 1}
              <span class="absolute bottom-0 left-16 right-0 border-b border-surface-3/70"></span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  </aside>

  <section
    class={`min-w-0 flex-1 overflow-y-auto overscroll-contain ${isSettingsRootRoute ? 'hidden lg:block' : 'block'}`}
    data-scrollable
  >
    <div class="w-full px-4 pb-8 pt-6 lg:px-8 lg:py-8">
      <div class="mb-6 lg:hidden">
        <button
          class="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-2 text-sm font-medium text-text-1 transition-colors hover:bg-surface-3"
          onclick={openSettingsIndex}
        >
          <span class="i-lucide-chevron-left text-base"></span>
          <span>Settings</span>
        </button>
      </div>

      <div class="mb-6">
        <h2 class="text-2xl font-semibold text-text-1">{activeItem.label}</h2>
        <p class="mt-1 text-sm text-text-3">{activeItem.description}</p>
      </div>

      {#if activeTab === 'app'}
        <AppSettings />
      {:else if activeTab === 'storage'}
        <StorageSettings />
      {:else if activeTab === 'traffic'}
        <TransportUsageSettings embedded={true} />
      {:else if activeTab === 'servers'}
        <ServersSettings embedded={true} />
      {:else}
        <P2PSettings embedded={true} />
      {/if}
    </div>
  </section>
</div>
