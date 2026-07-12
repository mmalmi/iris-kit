import type { IrisFipsMessagingEndpoint } from '../src/index.js';

interface ExistingFipsNodeShape {
  sendEndpointData(args: { dst: string; payload: Uint8Array }): Promise<void>;
  on(event: 'peer' | 'route' | 'session' | 'datagram' | 'endpointData' | 'error', listener: (event: unknown) => void): () => void;
}

declare const existingFipsNode: ExistingFipsNodeShape;

// The adapter accepts an existing FipsNode structurally; it never constructs or configures one.
const messagingEndpoint: IrisFipsMessagingEndpoint = existingFipsNode;
void messagingEndpoint;
