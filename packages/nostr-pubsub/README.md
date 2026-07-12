# @iris/nostr-pubsub

Signed application-event messaging over an Iris app's existing FIPS runtime.
The adapter supplies bounded `nostr-pubsub` inv/want propagation and protocol
multiplexing. It does not create a FIPS node, WebRTC transport, Nostr discovery
subscription, relay connection, bootstrap peer, or default route.

Only enable it in an app that already owns a working FIPS runtime and can supply
its authenticated/routable peer IDs:

```ts
import { createIrisFipsPubsub } from '@iris/nostr-pubsub';

const messages = createIrisFipsPubsub({
  endpoint: existingFipsNode,
  peers: () => existingFipsRuntime.authenticatedPeerIds(),
  protocol: 'iris.chat.messages',
  allowedKinds: new Set([14]),
});

const unsubscribe = messages.subscribe(({ event, sourcePeer }) => {
  console.log('verified event', event.id, 'from FIPS identity', sourcePeer);
});

await messages.publish(signedEvent);
```

The peer callback is the sole peer input. Applications keep their durable Nostr
relay subscriptions and local indexes; this adapter is a live signed-event path,
not a persistence replacement. Different apps must use different protocol
namespaces. Call `close()` before discarding an adapter. Closing it removes only
its endpoint listener and never stops the app-owned FIPS node.
