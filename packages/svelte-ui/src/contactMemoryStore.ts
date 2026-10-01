import {
  approveContactName,
  emptyContactMemory,
  observeContactName,
  setContactFavorite,
  type ContactMemory,
} from './contactMemory.ts';

export interface ContactMemoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Account-scoped local persistence. It never reads or writes public follows. */
export function createContactMemoryStore(storage: ContactMemoryStorage, prefix = 'iris-contact-memory:v1:') {
  const listeners = new Set<(version: number) => void>();
  let version = 0;

  const keyFor = (viewer: string, contact: string) => {
    if (!/^[a-f0-9]{64}$/i.test(viewer) || !/^[a-f0-9]{64}$/i.test(contact)) return null;
    return `${prefix}${viewer.toLowerCase()}:${contact.toLowerCase()}`;
  };

  function get(viewer: string, contact: string): ContactMemory | null {
    const key = keyFor(viewer, contact);
    if (!key) return null;
    try {
      const raw = storage.getItem(key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
      const memory = emptyContactMemory();
      for (const name of ['first_seen_name', 'accepted_name'] as const) {
        if (typeof data[name] === 'string' && data[name].trim()) memory[name] = data[name];
      }
      memory.favorite = data.favorite === true;
      if (Array.isArray(data.name_changes)) {
        memory.name_changes = data.name_changes.filter((item: unknown) => {
          if (!item || typeof item !== 'object') return false;
          const change = item as Record<string, unknown>;
          return typeof change.previous_name === 'string' && typeof change.accepted_name === 'string' &&
            Number.isSafeInteger(change.accepted_at_secs) && (change.accepted_at_secs as number) >= 0;
        }).map((item: ContactMemory['name_changes'][number]) => ({
          previous_name: item.previous_name,
          accepted_name: item.accepted_name,
          accepted_at_secs: item.accepted_at_secs,
        }));
      }
      return memory;
    } catch {
      return null;
    }
  }

  function refresh() {
    version += 1;
    for (const listener of listeners) listener(version);
  }

  function save(viewer: string, contact: string, memory: ContactMemory): void {
    const key = keyFor(viewer, contact);
    if (!key || viewer.toLowerCase() === contact.toLowerCase()) return;
    // Write before notifying. Failed persistence must not appear successful.
    storage.setItem(key, JSON.stringify(memory));
    refresh();
  }

  function remember(viewer: string, contact: string, name: string | null): void {
    const old = get(viewer, contact);
    const next = observeContactName(old ?? emptyContactMemory(), name);
    if (old === null || next !== old) save(viewer, contact, next);
  }

  return {
    get,
    remember,
    refresh,
    subscribe(run: (version: number) => void) {
      listeners.add(run);
      run(version);
      return () => { listeners.delete(run); };
    },
    observeKnown(viewer: string, contact: string, name: string | null) {
      const memory = get(viewer, contact);
      if (memory) {
        const next = observeContactName(memory, name);
        if (next !== memory) save(viewer, contact, next);
      }
    },
    setFavorite(viewer: string, contact: string, favorite: boolean, name: string | null) {
      const memory = observeContactName(get(viewer, contact) ?? emptyContactMemory(), name);
      save(viewer, contact, setContactFavorite(memory, favorite));
    },
    approve(viewer: string, contact: string, expected: string, current: string | null, nowSecs: number) {
      const memory = get(viewer, contact);
      if (!memory) return false;
      const next = approveContactName(memory, expected, current, nowSecs);
      if (next === memory) return false;
      save(viewer, contact, next);
      return true;
    },
  };
}
