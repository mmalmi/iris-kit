import { generateSecretKey, verifyEvent, type Event, type Filter } from 'nostr-tools';
import { BunkerSigner, parseBunkerInput, type BunkerSignerParams } from 'nostr-tools/nip46';
import { createNostrIdentitySignerFromNip46, type NostrIdentityEventSigner } from './signers.ts';

/** The caller owns relay connections and keeps remote-signing traffic scoped. */
export interface RemoteSignerTransport {
  subscribe(relays: string[], filters: Filter[], receive: (event: Event) => void): { close(): void };
  publish(relays: string[], event: Event): Promise<void>;
}
export interface RemoteNostrIdentitySigner extends NostrIdentityEventSigner { close(): Promise<void>; }
export interface RemoteSignerOptions {
  connection: string;
  relays?: string[];
  transport: RemoteSignerTransport;
  /** Reuse this key when restoring an application-owned remote signer session. */
  clientSecretKey?: Uint8Array;
  timeoutMs?: number;
  onAuth?: (url: string) => void;
}

/** NIP-46 protocol/signature handling stays in nostr-tools; this adds bounded lifecycle and injected transport. */
export async function connectRemoteNostrIdentitySigner(options: RemoteSignerOptions): Promise<RemoteNostrIdentitySigner> {
  const timeout = options.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new RangeError('Invalid remote signer timeout');
  const pointer = await timed(parseBunkerInput(options.connection.trim()), timeout);
  if (!pointer) throw new Error('Invalid remote signer address');
  if (options.relays?.length) pointer.relays = [...options.relays];
  const subscriptions = new Set<{ close(): void }>();
  const pool = {
    subscribe(relays: string[], filter: Filter, handlers: { onevent?(event: Event): void | Promise<void>; onclose?(): void }) {
      const subscription = options.transport.subscribe(relays, [filter], event => {
        // Do not rely on a transport's public verification marker.
        const candidate = { id: event.id, pubkey: event.pubkey, sig: event.sig, kind: event.kind,
          created_at: event.created_at, content: event.content, tags: event.tags.map(tag => [...tag]) };
        if (verifyEvent(candidate)) void Promise.resolve(handlers.onevent?.(candidate)).catch(() => undefined);
      });
      const close = () => { subscription.close(); subscriptions.delete(result); handlers.onclose?.(); };
      const result = { close }; subscriptions.add(result); return result;
    },
    publish(relays: string[], event: Event) { return [options.transport.publish(relays, event).then(() => '')]; },
  };
  // BunkerSigner currently declares a concrete AbstractSimplePool, but only
  // consumes these two methods. Keep that protocol-library adaptation here.
  const signer = BunkerSigner.fromBunker(options.clientSecretKey ?? generateSecretKey(), pointer, {
    pool: pool as unknown as NonNullable<BunkerSignerParams['pool']>, onauth: options.onAuth,
  });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    for (const subscription of [...subscriptions]) subscription.close();
    // A closed subscription clears the upstream closer; avoid its non-null close assumption.
  };
  const request = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (closed) throw new Error('Remote signer is closed');
    try { return await timed(operation(), timeout); }
    catch (error) { await close(); throw error; }
  };
  try {
    await request(() => signer.connect());
    await request(() => signer.getPublicKey());
  } catch (error) { await close(); throw error; }
  return Object.assign(createNostrIdentitySignerFromNip46({
    getPublicKey: () => request(() => signer.getPublicKey()),
    signEvent: event => request(() => signer.signEvent(event)),
    nip44Encrypt: (peer, plaintext) => request(() => signer.nip44Encrypt(peer, plaintext)),
    nip44Decrypt: (peer, ciphertext) => request(() => signer.nip44Decrypt(peer, ciphertext)),
  }), { close });
}

function timed<T>(operation: Promise<T>, timeout: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Remote signer did not respond in time')), timeout);
    operation.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
