import { generateSecretKey } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import { connectRemoteNostrIdentitySigner, parseBunkerConnection, type RemoteNostrIdentitySigner, type RemoteSignerTransport } from './remoteSigner.ts';
import type { NostrIdentityEventSigner } from './signers.ts';
import { showSignerApproval } from './signerDialog.ts';

export interface BrowserSignerSession {
  pubkey: string;
  connection: string;
  clientKey: string;
}

export interface BrowserSignerOptions {
  name?: string;
  permissions?: string;
  onAuth?: (url: string) => void;
  signal?: AbortSignal;
}

export function isBrowserSignerSession(value: unknown): value is BrowserSignerSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<BrowserSignerSession>;
  if (typeof session.connection !== 'string' || typeof session.pubkey !== 'string' ||
      typeof session.clientKey !== 'string' || !/^[0-9a-f]{64}$/.test(session.clientKey) ||
      !/^[0-9a-f]{64}$/.test(session.pubkey)) return false;
  try { return parseBunkerConnection(session.connection).secret === null; }
  catch { return false; }
}

// Bind each publication to a socket on which the response subscription has
// already been sent. A fast signer can reply before another socket connects.
function browserTransport(pool: SimplePool, signal: AbortSignal): RemoteSignerTransport {
  let channels = new Map<string, ReturnType<SimplePool['ensureRelay']>>();
  return {
    subscribe(relays, filters, receive) {
      const subscriptions = new Set<{ close(): void }>();
      let closed = false;
      channels = new Map(relays.map(url => {
        const channel = pool.ensureRelay(url, { connectionTimeout: 8000, abort: signal }).then(relay => {
          if (closed || signal.aborted) throw new Error('Signer connection closed');
          subscriptions.add(relay.subscribe(filters, { onevent: receive }));
          return relay;
        });
        // A cancelled connection can finish before the first publication.
        void channel.catch(() => {});
        return [url, channel];
      }));
      return { close() { closed = true; for (const sub of subscriptions) sub.close(); } };
    },
    async publish(relays, event) {
      await Promise.any(relays.map(async url => {
        const relay = await channels.get(url);
        if (!relay || signal.aborted) throw new Error('Signer connection closed');
        await relay.publish(event);
      }));
    },
  };
}

async function exchange<T>(connection: string, key: Uint8Array, resume: boolean, options: BrowserSignerOptions,
  action: (signer: RemoteNostrIdentitySigner) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const pool = new SimplePool({ enableReconnect: false });
  let signer: RemoteNostrIdentitySigner | undefined;
  let approval: ReturnType<typeof showSignerApproval> | undefined;
  try {
    signer = await connectRemoteNostrIdentitySigner({
      connection, clientSecretKey: key, resume, switchRelays: !resume, signal, timeoutMs: 90_000,
      permissions: options.permissions,
      clientMetadata: options.name ? { name: options.name } : undefined,
      transport: browserTransport(pool, signal),
      onAuth(url) {
        if (options.onAuth) return options.onAuth(url);
        approval?.close();
        approval = showSignerApproval(url, () => controller.abort());
      },
    });
    return await action(signer);
  } catch (error) {
    if (signal.aborted) throw new DOMException('Signer request cancelled.', 'AbortError');
    if (error instanceof Error && error.message.includes('did not respond')) {
      throw new Error('The signer did not respond. Open your signer and try again.');
    }
    // Remote errors may contain the pairing secret or the event being signed.
    throw new Error('Signer request failed. Check your signer and try again.');
  } finally {
    approval?.close();
    await signer?.close();
    controller.abort();
    pool.destroy();
    key.fill(0);
  }
}

export async function pairBrowserSigner(connection: string, options: BrowserSignerOptions = {}): Promise<BrowserSignerSession> {
  try { parseBunkerConnection(connection); }
  catch { throw new Error('Enter a bunker:// link from your signer, including its relay.'); }
  const key = generateSecretKey();
  return exchange(connection, key, false, options, async signer => ({
    pubkey: await signer.getPublicKey(), connection: signer.connection, clientKey: bytesToHex(key),
  }));
}

// Restore offline. Recheck the signer's identity on every new connection before
// sending a draft or asking it to encrypt or decrypt anything.
export function restoreBrowserSigner(session: BrowserSignerSession, options: BrowserSignerOptions = {}): NostrIdentityEventSigner {
  if (!isBrowserSignerSession(session)) throw new Error('Invalid signer session. Connect your signer again.');
  const { connection, pubkey, clientKey } = session;
  const withSigner = <T>(action: (signer: RemoteNostrIdentitySigner) => Promise<T>) =>
    exchange(connection, hexToBytes(clientKey), true, options, async signer => {
      if (await signer.getPublicKey() !== pubkey) throw new Error('Signer account changed');
      return action(signer);
    });
  return {
    method: 'nip46',
    getPublicKey: () => pubkey,
    signEvent: draft => withSigner(async signer => signer.signEvent(draft)),
    nip44Encrypt: (peer, text) => withSigner(async signer => signer.nip44Encrypt!(peer, text)),
    nip44Decrypt: (peer, text) => withSigner(async signer => signer.nip44Decrypt!(peer, text)),
  };
}

export { requestBrowserSigner } from './signerDialog.ts';
