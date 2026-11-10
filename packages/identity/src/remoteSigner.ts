import { generateSecretKey, matchFilter, verifyEvent, type Event, type Filter } from 'nostr-tools';
import { BunkerSigner, parseBunkerInput, toBunkerURL, type BunkerPointer, type BunkerSignerParams } from 'nostr-tools/nip46';
import { createNostrIdentitySignerFromNip46, type NostrIdentityEventSigner } from './signers.ts';

/** The caller owns relay connections and keeps remote-signing traffic scoped. */
export interface RemoteSignerTransport {
  subscribe(relays: string[], filters: Filter[], receive: (event: Event) => void): { close(): void };
  publish(relays: string[], event: Event): Promise<void>;
}
export interface RemoteNostrIdentitySigner extends NostrIdentityEventSigner {
  /** Connection without the single-use pairing secret, suitable for resuming. */
  readonly connection: string;
  close(): Promise<void>;
}
export interface RemoteSignerOptions {
  connection: string;
  relays?: string[];
  transport: RemoteSignerTransport;
  /** Reuse this key when restoring an application-owned remote signer session. */
  clientSecretKey?: Uint8Array;
  /** Resume an approved client key without replaying a single-use connect secret. */
  resume?: boolean;
  signal?: AbortSignal;
  permissions?: string;
  clientMetadata?: { name?: string; url?: string; image?: string };
  /** Ask the signer for its preferred relays on initial pairing. */
  switchRelays?: boolean;
  timeoutMs?: number;
  onAuth?: (url: string) => void;
}

function relayUrls(values: string[]): string[] {
  const urls = [...new Set(values.map(value => {
    const url = new URL(value);
    if (!['wss:', 'ws:'].includes(url.protocol) || url.username || url.password || url.hash) {
      throw new Error('Invalid remote signer relay');
    }
    return url.toString();
  }))];
  if (!urls.length || urls.length > 8) throw new Error('Invalid remote signer relays');
  return urls;
}

/** Parse a bunker link locally, without NIP-05 discovery or other network requests. */
export function parseBunkerConnection(value: string, relays?: string[]): BunkerPointer {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Invalid bunker link'); }
  if (url.protocol !== 'bunker:' || !/^[a-f0-9]{64}$/.test(url.hostname) ||
      (url.pathname && url.pathname !== '/') || url.username || url.password || url.port || url.hash) {
    throw new Error('Invalid bunker link');
  }
  return { pubkey: url.hostname, relays: relayUrls(relays?.length ? relays : url.searchParams.getAll('relay')), secret: url.searchParams.get('secret') };
}

/** NIP-46 protocol/signature handling stays in nostr-tools; this adds bounded lifecycle and injected transport. */
export async function connectRemoteNostrIdentitySigner(options: RemoteSignerOptions): Promise<RemoteNostrIdentitySigner> {
  const timeout = options.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new RangeError('Invalid remote signer timeout');
  if (options.resume && !options.clientSecretKey) throw new Error('Resuming requires the original client key');
  options.signal?.throwIfAborted();
  const connection = options.connection.trim();
  const pointer = connection.startsWith('bunker:')
    ? parseBunkerConnection(connection, options.relays)
    : await timed(parseBunkerInput(connection), timeout, options.signal);
  if (!pointer || !/^[a-f0-9]{64}$/.test(pointer.pubkey)) throw new Error('Invalid remote signer address');
  pointer.relays = relayUrls(options.relays?.length ? options.relays : pointer.relays);
  options.signal?.throwIfAborted();
  const controller = new AbortController();
  const clientKey = new Uint8Array(options.clientSecretKey ?? generateSecretKey());
  const subscriptions = new Set<{ close(): void }>();
  const pool = {
    subscribe(relays: string[], filter: Filter, handlers: { onevent?(event: Event): void | Promise<void>; onclose?(): void }) {
      const subscription = options.transport.subscribe(relays, [filter], event => {
        if (controller.signal.aborted) return;
        // Do not rely on a transport's public verification marker.
        try {
          const candidate = { id: event.id, pubkey: event.pubkey, sig: event.sig, kind: event.kind,
            created_at: event.created_at, content: event.content, tags: event.tags.map(tag => [...tag]) };
          if (verifyEvent(candidate) && matchFilter(filter, candidate)) {
            void Promise.resolve(handlers.onevent?.(candidate)).catch(() => undefined);
          }
        } catch { /* Ignore malformed relay traffic. */ }
      });
      const close = () => { subscription.close(); subscriptions.delete(result); handlers.onclose?.(); };
      const result = { close }; subscriptions.add(result); return result;
    },
    publish(relays: string[], event: Event) { return [options.transport.publish(relays, event).then(() => '')]; },
  };
  // BunkerSigner currently declares a concrete AbstractSimplePool, but only
  // consumes these two methods. Keep that protocol-library adaptation here.
  const params = {
    pool: pool as unknown as NonNullable<BunkerSignerParams['pool']>,
    onauth: (value: string) => {
      if (controller.signal.aborted) return;
      try {
        const url = new URL(value);
        if (url.protocol === 'https:' && !url.username && !url.password) options.onAuth?.(url.href);
      } catch { /* Never navigate to an untrusted scheme supplied by a signer. */ }
    },
  };
  let signer = BunkerSigner.fromBunker(clientKey, pointer, params);
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    options.signal?.removeEventListener('abort', abort);
    controller.abort(new Error('Remote signer is closed'));
    for (const subscription of [...subscriptions]) subscription.close();
    clientKey.fill(0);
    // A closed subscription clears the upstream closer; avoid its non-null close assumption.
  };
  const abort = () => { void close(); };
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) await close();
  const request = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (closed) throw new Error('Remote signer is closed');
    try { return await timed(operation(), timeout, controller.signal); }
    catch (error) { await close(); throw error; }
  };
  try {
    if (!options.resume) {
      const args = [pointer.pubkey, pointer.secret || ''];
      if (options.permissions || options.clientMetadata) args.push(options.permissions ?? '');
      if (options.clientMetadata) args.push(JSON.stringify(options.clientMetadata));
      const confirmation = await request(() => signer.sendRequest('connect', args));
      if (confirmation !== 'ack' && (!pointer.secret || confirmation !== pointer.secret)) throw new Error('Invalid signer confirmation');
    }
    if (options.switchRelays) {
      // Older signers may not implement this optional request. Do not close a
      // valid connection just because they reject it or leave it unanswered.
      const result = await timed(signer.sendRequest('switch_relays', []), Math.min(timeout, 3000), controller.signal)
        .catch(() => 'null');
      if (closed) throw new Error('Remote signer is closed');
      if (result !== 'null') {
        const values: unknown = JSON.parse(result);
        if (!Array.isArray(values) || !values.every(value => typeof value === 'string')) throw new Error('Invalid remote signer relays');
        pointer.relays = relayUrls(values);
        await signer.close();
        signer = BunkerSigner.fromBunker(clientKey, pointer, params);
      }
    }
    const pubkey = await request(() => signer.getPublicKey());
    if (!/^[a-f0-9]{64}$/.test(pubkey)) throw new Error('Invalid public key from remote signer');
  } catch (error) { await close(); throw error; }
  return Object.assign(createNostrIdentitySignerFromNip46({
    getPublicKey: () => request(() => signer.getPublicKey()),
    signEvent: event => request(() => signer.signEvent(event)),
    nip44Encrypt: (peer, plaintext) => request(() => signer.nip44Encrypt(peer, plaintext)),
    nip44Decrypt: (peer, ciphertext) => request(() => signer.nip44Decrypt(peer, ciphertext)),
  }), { connection: toBunkerURL({ ...pointer, secret: null }), close });
}

function timed<T>(operation: Promise<T>, timeout: number, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const abort = () => { finish(); reject(signal?.reason ?? new Error('Remote signer is closed')); };
    const timer = setTimeout(() => { finish(); reject(new Error('Remote signer did not respond in time')); }, timeout);
    signal?.addEventListener('abort', abort, { once: true });
    operation.then(value => { finish(); resolve(value); }, error => { finish(); reject(error); });
    if (signal?.aborted) abort();
  });
}
