import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure';
import { createIrisFipsPubsub } from './index.ts';

const PEER_A = `02${'11'.repeat(32)}`;
const PEER_B = `03${'22'.repeat(32)}`;
const PEER_C = `02${'33'.repeat(32)}`;

class MemoryFipsNetwork {
  endpoints = new Map();

  endpoint(peerId) {
    const listeners = new Set();
    const endpoint = {
      async sendEndpointData({ dst, payload }) {
        const target = this.network.endpoints.get(dst);
        if (!target) throw new Error(`unroutable peer ${dst}`);
        target.receive({ src: peerId, dst, payload: new Uint8Array(payload) });
      },
      on(event, listener) {
        assert.equal(event, 'endpointData');
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      receive(event) {
        for (const listener of listeners) listener(event);
      },
      network: this,
    };
    this.endpoints.set(peerId, endpoint);
    return endpoint;
  }
}

function signedEvent(kind = 30_078) {
  return finalizeEvent({
    kind,
    created_at: 1_700_000_000,
    tags: [['d', 'iris-kit-test']],
    content: 'hello over existing FIPS',
  }, generateSecretKey());
}

async function settle(adapters, predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await Promise.all(adapters.map((adapter) => adapter.idle()));
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (predicate()) return;
  }
  assert.fail('pubsub adapters did not settle');
}

test('delivers a signed event over existing FIPS endpoints without owning discovery', async () => {
  const network = new MemoryFipsNetwork();
  const peers = new Map([
    [PEER_A, [PEER_B]],
    [PEER_B, [PEER_A, PEER_C]],
    [PEER_C, [PEER_B]],
  ]);
  const peerReads = new Map([[PEER_A, 0], [PEER_B, 0], [PEER_C, 0]]);
  const adapters = [PEER_A, PEER_B, PEER_C].map((peerId) => createIrisFipsPubsub({
    endpoint: network.endpoint(peerId),
    peers: () => {
      peerReads.set(peerId, peerReads.get(peerId) + 1);
      return peers.get(peerId);
    },
    protocol: 'iris.test.messages',
    allowedKinds: new Set([30_078]),
    mesh: { fanout: 2, unknownPeerReserve: 1 },
  }));
  const deliveries = [];
  adapters[1].subscribe((delivery) => deliveries.push(['b', delivery]));
  adapters[2].subscribe((delivery) => deliveries.push(['c', delivery]));

  const event = signedEvent();
  const report = await adapters[0].publish(event);
  assert.deepEqual(report, { availablePeers: 1, framesSent: 1 });
  await settle(adapters, () => deliveries.length === 2);
  assert.deepEqual(deliveries.map(([name, delivery]) => [name, delivery.event.id]), [
    ['b', event.id],
    ['c', event.id],
  ]);
  assert.ok([...peerReads.values()].every((reads) => reads > 0));

  for (const adapter of adapters) adapter.close();
});

test('multiplexes protocols and enforces explicit kind admission', async () => {
  const network = new MemoryFipsNetwork();
  const endpointA = network.endpoint(PEER_A);
  const endpointB = network.endpoint(PEER_B);
  const errors = [];
  const chat = createIrisFipsPubsub({
    endpoint: endpointA,
    peers: () => [PEER_B],
    protocol: 'iris.chat.messages',
    allowedKinds: new Set([1]),
    onError: (error) => errors.push(error),
  });
  const board = createIrisFipsPubsub({
    endpoint: endpointB,
    peers: () => [PEER_A],
    protocol: 'iris.board.messages',
    allowedKinds: new Set([30_078]),
    onError: (error) => errors.push(error),
  });

  await chat.publish(signedEvent(1));
  await settle([chat, board], () => true);
  assert.deepEqual(errors, []);
  await assert.rejects(() => board.publish(signedEvent(1)), /event kind 1/);

  chat.close();
  board.close();
  await assert.rejects(() => chat.publish(signedEvent(1)), /closed/);
});
