import {
  DEFAULT_INV_WANT_MAX_WIRE_BYTES,
  InvWantCodec,
  InvWantMesh,
  meshPeer,
  type InvWantAction,
  type InvWantMeshOptions,
  type MeshPeer,
  type NostrEvent,
  type NostrVerifiedEvent,
} from 'nostr-pubsub';

const COMPRESSED_PUBKEY_PATTERN = /^(02|03)[0-9a-f]{64}$/;
const PROTOCOL_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;

export interface IrisFipsEndpointData {
  src: string;
  dst: string;
  payload: Uint8Array;
}

/** Minimal surface from an already-running FIPS node. It deliberately has no discovery methods. */
export interface IrisFipsMessagingEndpoint {
  sendEndpointData(args: { dst: string; payload: Uint8Array }): Promise<void>;
  on(event: 'endpointData', listener: (event: unknown) => void): () => void;
}

export type IrisFipsPeerSource = (
  () => readonly (string | MeshPeer)[] | Promise<readonly (string | MeshPeer)[]>
);

export interface IrisFipsPubsubErrorContext {
  operation: 'decode' | 'receive' | 'send' | 'listener';
  peerId?: string;
}

export interface IrisFipsPubsubOptions {
  endpoint: IrisFipsMessagingEndpoint;
  /** Existing authenticated/routable peers supplied by the owning FIPS runtime. */
  peers: IrisFipsPeerSource;
  /** App-specific wire namespace, for example `iris.chat.messages`. */
  protocol: string;
  /** Explicit event-kind admission prevents one app namespace accepting every signed event. */
  allowedKinds: ReadonlySet<number>;
  version?: number;
  maxWireBytes?: number;
  maxPendingFrames?: number;
  mesh?: Omit<Partial<InvWantMeshOptions>, 'allowedKinds'>;
  now?: () => number;
  onError?: (error: Error, context: IrisFipsPubsubErrorContext) => void;
}

export interface IrisFipsPubsubDelivery {
  event: NostrVerifiedEvent;
  sourcePeer: string;
}

export interface IrisFipsPubsubPublishReport {
  availablePeers: number;
  framesSent: number;
}

export type IrisFipsPubsubListener = (
  delivery: IrisFipsPubsubDelivery,
) => Promise<void> | void;

/**
 * Bounded inv/want messaging over opaque bytes from an existing FIPS node.
 * This adapter never creates transports, relay connections, adverts, or peers.
 */
export class IrisFipsPubsub {
  readonly codec: InvWantCodec;
  readonly mesh: InvWantMesh;

  private readonly endpoint: IrisFipsMessagingEndpoint;
  private readonly peers: IrisFipsPeerSource;
  private readonly now: () => number;
  private readonly onError: NonNullable<IrisFipsPubsubOptions['onError']>;
  private readonly maxPendingFrames: number;
  private readonly listeners = new Set<IrisFipsPubsubListener>();
  private readonly removeEndpointListener: () => void;
  private inboundTail: Promise<void> = Promise.resolve();
  private pendingInboundFrames = 0;
  private closed = false;

  constructor(options: IrisFipsPubsubOptions) {
    const protocol = normalizeProtocol(options.protocol);
    if (options.allowedKinds.size === 0) {
      throw new Error('Iris FIPS pubsub requires at least one allowed Nostr kind');
    }
    this.endpoint = options.endpoint;
    this.peers = options.peers;
    this.now = options.now ?? Date.now;
    this.onError = options.onError ?? (() => {});
    this.maxPendingFrames = positiveInteger(options.maxPendingFrames ?? 64, 'max pending frames');
    this.codec = new InvWantCodec(
      protocol,
      options.version ?? 1,
      options.maxWireBytes ?? DEFAULT_INV_WANT_MAX_WIRE_BYTES,
    );
    this.mesh = new InvWantMesh({
      ...options.mesh,
      allowedKinds: options.allowedKinds,
    });
    this.removeEndpointListener = this.endpoint.on('endpointData', (value) => {
      const event = readEndpointData(value);
      if (
        this.closed
        || event === null
        || !isProtocolFrame(event.payload, this.codec.protocol, this.codec.maxWireBytes)
      ) {
        return;
      }
      if (this.pendingInboundFrames >= this.maxPendingFrames) {
        this.reportError(new Error('Iris FIPS pubsub inbound queue is full'), {
          operation: 'receive',
          peerId: event.src,
        });
        return;
      }
      this.pendingInboundFrames += 1;
      const task = this.inboundTail.then(() => this.receive(event));
      this.inboundTail = task.catch(() => undefined).finally(() => {
        this.pendingInboundFrames -= 1;
      });
      void task.catch((error) => this.reportError(error, { operation: 'receive', peerId: event.src }));
    });
  }

  subscribe(listener: IrisFipsPubsubListener): () => void {
    this.assertOpen();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async publish(event: NostrEvent): Promise<IrisFipsPubsubPublishReport> {
    this.assertOpen();
    const peers = await this.readPeers();
    const actions = this.mesh.publish(event, peers, this.now());
    const framesSent = await this.dispatch(actions);
    return { availablePeers: peers.length, framesSent };
  }

  /** Resolves after this adapter has processed all endpoint frames accepted so far. */
  idle(): Promise<void> {
    return this.inboundTail;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.removeEndpointListener();
    this.listeners.clear();
  }

  private async receive(event: IrisFipsEndpointData): Promise<void> {
    const sourcePeer = normalizePeerId(event.src);
    let message;
    try {
      message = this.codec.decode(event.payload);
    } catch (error) {
      this.mesh.recordInvalidMessage(sourcePeer);
      this.reportError(error, { operation: 'decode', peerId: sourcePeer });
      return;
    }
    const actions = this.mesh.receive(sourcePeer, message, await this.readPeers(), this.now());
    await this.dispatch(actions);
  }

  private async dispatch(actions: readonly InvWantAction[]): Promise<number> {
    let framesSent = 0;
    for (const action of actions) {
      if (action.type === 'deliver') {
        await this.deliver({ event: action.event, sourcePeer: action.sourcePeer });
        continue;
      }
      const peerId = normalizePeerId(action.peerId);
      try {
        await this.endpoint.sendEndpointData({
          dst: peerId,
          payload: this.codec.encode(action.message),
        });
        framesSent += 1;
      } catch (error) {
        this.reportError(error, { operation: 'send', peerId });
        throw error;
      }
    }
    return framesSent;
  }

  private async deliver(delivery: IrisFipsPubsubDelivery): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener(delivery);
      } catch (error) {
        this.reportError(error, { operation: 'listener', peerId: delivery.sourcePeer });
      }
    }
  }

  private async readPeers(): Promise<MeshPeer[]> {
    const peers = await this.peers();
    return peers.map((peer) => typeof peer === 'string'
      ? meshPeer(normalizePeerId(peer))
      : meshPeer(normalizePeerId(peer.id), peer.qualityScore));
  }

  private reportError(error: unknown, context: IrisFipsPubsubErrorContext): void {
    try {
      this.onError(error instanceof Error ? error : new Error(String(error)), context);
    } catch {
      // Error reporting must not break the bounded receive queue.
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('Iris FIPS pubsub adapter is closed');
  }
}

export function createIrisFipsPubsub(options: IrisFipsPubsubOptions): IrisFipsPubsub {
  return new IrisFipsPubsub(options);
}

function normalizeProtocol(value: string): string {
  const protocol = value.trim();
  if (!PROTOCOL_PATTERN.test(protocol)) {
    throw new Error('Iris FIPS pubsub protocol must be 1-128 lowercase namespace characters');
  }
  return protocol;
}

function normalizePeerId(value: string): string {
  const peerId = value.trim().toLowerCase();
  if (!COMPRESSED_PUBKEY_PATTERN.test(peerId)) {
    throw new Error('Iris FIPS pubsub peers must be compressed secp256k1 pubkeys');
  }
  return peerId;
}

function isProtocolFrame(payload: Uint8Array, protocol: string, maxWireBytes: number): boolean {
  if (!(payload instanceof Uint8Array) || payload.byteLength === 0 || payload.byteLength > maxWireBytes) {
    return false;
  }
  try {
    const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload)) as unknown;
    return envelope !== null
      && typeof envelope === 'object'
      && !Array.isArray(envelope)
      && (envelope as { protocol?: unknown }).protocol === protocol;
  } catch {
    return false;
  }
}

function readEndpointData(value: unknown): IrisFipsEndpointData | null {
  if (value === null || typeof value !== 'object') return null;
  const event = value as Partial<IrisFipsEndpointData>;
  return typeof event.src === 'string'
    && typeof event.dst === 'string'
    && event.payload instanceof Uint8Array
    ? { src: event.src, dst: event.dst, payload: event.payload }
    : null;
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Iris FIPS pubsub ${field} must be a positive safe integer`);
  }
  return value;
}
