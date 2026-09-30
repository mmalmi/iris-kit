import type { Event, EventTemplate, Filter } from 'nostr-tools';

export type { Event, EventTemplate, Filter } from 'nostr-tools';

export interface EventSigner {
  getPublicKey(): string | Promise<string>;
  signEvent(event: EventTemplate): Event | Promise<Event>;
}

export interface HistoryStatus {
  complete: boolean;
  reason: string;
}

/** The worker or native adapter owns networking, storage and publication retries. */
export interface AppEventBackend {
  subscribe(filters: Filter[], event: (event: Event) => void, history: (status?: HistoryStatus) => void): string;
  unsubscribe(id: string): void;
  publish(event: Event): Promise<unknown>;
}

type EventHandlers = {
  event: (event: Event) => void;
  history: (status: HistoryStatus) => void;
  close: () => void;
};

/** A UI subscription survives backend replacement without opening another relay pool. */
export class EventSubscription {
  private readonly handlers: { [K in keyof EventHandlers]: Set<EventHandlers[K]> } = {
    event: new Set(), history: new Set(), close: new Set(),
  };
  private detach?: () => void;
  private generation = 0;
  private closed = false;
  readonly filters: Filter[];
  private readonly closeAfterHistory: boolean;
  private readonly release: () => void;

  constructor(filters: Filter[], closeAfterHistory: boolean, release: () => void) {
    this.filters = filters;
    this.closeAfterHistory = closeAfterHistory;
    this.release = release;
  }

  on<K extends keyof EventHandlers>(name: K, handler: EventHandlers[K]): this {
    this.handlers[name].add(handler);
    return this;
  }

  bind(backend?: AppEventBackend): void {
    const generation = ++this.generation;
    this.detach?.();
    this.detach = undefined;
    if (!backend || this.closed) return;
    const id = backend.subscribe(this.filters, event => {
      if (!this.closed && generation === this.generation) this.emit('event', event);
    }, status => {
      if (this.closed || generation !== this.generation) return;
      const completion = status ?? { complete: true, reason: 'eose' };
      this.emit('history', completion);
      if (this.closeAfterHistory) this.stop();
    });
    if (this.closed || generation !== this.generation) backend.unsubscribe(id);
    else this.detach = () => backend.unsubscribe(id);
  }

  stop(): void {
    if (this.closed) return;
    this.closed = true;
    ++this.generation;
    this.detach?.();
    this.detach = undefined;
    this.release();
    this.emit('close');
    this.handlers.event.clear();
    this.handlers.history.clear();
    this.handlers.close.clear();
  }

  private emit<K extends keyof EventHandlers>(name: K, ...args: Parameters<EventHandlers[K]>): void {
    for (const handler of this.handlers[name]) {
      (handler as (...values: Parameters<EventHandlers[K]>) => void)(...args);
    }
  }
}

/** Plain signed events and a single backend; keys remain in the app's existing session store. */
export class AppNostrClient {
  signer?: EventSigner;
  private backend?: AppEventBackend;
  private readonly subscriptions = new Set<EventSubscription>();
  private readonly ready = new Set<(backend: AppEventBackend) => void>();

  setBackend(backend?: AppEventBackend): void {
    if (this.backend === backend) return;
    this.backend = backend;
    for (const subscription of this.subscriptions) subscription.bind(backend);
    if (backend) {
      for (const ready of this.ready) ready(backend);
      this.ready.clear();
    }
  }

  subscribe(filters: Filter | Filter[], options: { closeAfterHistory?: boolean } = {}): EventSubscription {
    const subscription = new EventSubscription(
      structuredClone(Array.isArray(filters) ? filters : [filters]),
      options.closeAfterHistory ?? false,
      () => this.subscriptions.delete(subscription),
    );
    this.subscriptions.add(subscription);
    queueMicrotask(() => subscription.bind(this.backend));
    return subscription;
  }

  async fetchEvents(filters: Filter | Filter[], timeoutMs = 10_000): Promise<Set<Event>> {
    return new Promise((resolve, reject) => {
      const events = new Map<string, Event>();
      const subscription = this.subscribe(filters, { closeAfterHistory: true });
      const timer = setTimeout(() => {
        subscription.stop();
        if (events.size > 0) resolve(new Set(events.values()));
        else reject(new Error('Event history is incomplete; try again when connected.'));
      }, timeoutMs);
      subscription.on('event', event => events.set(event.id, event));
      subscription.on('history', status => {
        clearTimeout(timer);
        if (status.complete || events.size > 0) resolve(new Set(events.values()));
        else reject(new Error(`Event history is incomplete (${status.reason}).`));
      });
    });
  }

  async fetchEvent(idOrFilter: string | Filter): Promise<Event | null> {
    const events = await this.fetchEvents(typeof idOrFilter === 'string' ? { ids: [idOrFilter] } : idOrFilter);
    return [...events].sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))[0] ?? null;
  }

  async signEvent(draft: Partial<EventTemplate> & Pick<EventTemplate, 'kind'>): Promise<Event> {
    const signer = this.signer;
    if (!signer) throw new Error('Sign in before publishing.');
    const signed = await signer.signEvent({
      kind: draft.kind,
      created_at: draft.created_at ?? Math.floor(Date.now() / 1000),
      tags: draft.tags?.map(tag => [...tag]) ?? [],
      content: draft.content ?? '',
    });
    if (signer !== this.signer) throw new Error('Profile changed before signing completed.');
    return signed;
  }

  async publish(event: Event): Promise<unknown> {
    const backend = await this.waitForBackend();
    return backend.publish(event);
  }

  async publishEvent(draft: Partial<EventTemplate> & Pick<EventTemplate, 'kind'>): Promise<Event> {
    const signer = this.signer;
    const event = await this.signEvent(draft);
    const backend = await this.waitForBackend();
    if (signer !== this.signer) throw new Error('Profile changed before publication.');
    await backend.publish(event);
    return event;
  }

  private waitForBackend(): Promise<AppEventBackend> {
    if (this.backend) return Promise.resolve(this.backend);
    return new Promise((resolve, reject) => {
      const ready = (backend: AppEventBackend) => {
        clearTimeout(timer);
        resolve(backend);
      };
      const timer = setTimeout(() => {
        this.ready.delete(ready);
        reject(new Error('Event storage is not ready.'));
      }, 10_000);
      this.ready.add(ready);
    });
  }
}
