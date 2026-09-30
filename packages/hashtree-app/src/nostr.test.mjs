import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppNostrClient } from './nostr.ts';

function backend() {
  const subscriptions = new Map();
  const published = [];
  return {
    subscriptions, published,
    subscribe(filters, event, history) {
      const id = String(Math.random());
      subscriptions.set(id, { filters, event, history });
      return id;
    },
    unsubscribe(id) { subscriptions.delete(id); },
    async publish(event) { published.push(event); return { queued: true, remoteAccepted: false }; },
  };
}

test('subscriptions survive late startup and backend replacement without stale delivery', async () => {
  const client = new AppNostrClient();
  const received = [];
  const subscription = client.subscribe({ kinds: [0] }).on('event', event => received.push(event));
  await Promise.resolve();
  const first = backend();
  client.setBackend(first);
  const old = [...first.subscriptions.values()][0];
  old.event({ id: 'first' });
  const second = backend();
  client.setBackend(second);
  assert.equal(first.subscriptions.size, 0);
  old.event({ id: 'stale' });
  [...second.subscriptions.values()][0].event({ id: 'second' });
  subscription.stop();
  assert.equal(second.subscriptions.size, 0);
  assert.deepEqual(received, [{ id: 'first' }, { id: 'second' }]);
});

test('a partial history cannot be mistaken for a complete empty result', async () => {
  const client = new AppNostrClient();
  const source = backend();
  client.setBackend(source);
  const pending = client.fetchEvents({ kinds: [30078] });
  await Promise.resolve();
  [...source.subscriptions.values()][0].history({ complete: false, reason: 'timeout' });
  await assert.rejects(pending, /incomplete/);
  assert.equal(source.subscriptions.size, 0);
});

test('a profile change cancels a signed publication waiting for its backend', async () => {
  const client = new AppNostrClient();
  client.signer = { getPublicKey: () => 'alice', signEvent: async draft => ({ ...draft, pubkey: 'alice', id: 'signed', sig: 'sig' }) };
  const pending = client.publishEvent({ kind: 1, content: 'hello' });
  await Promise.resolve();
  await Promise.resolve();
  client.signer = undefined;
  const source = backend();
  client.setBackend(source);
  await assert.rejects(pending, /Profile changed/);
  assert.deepEqual(source.published, []);
});

test('publishing preserves the backend receipt instead of claiming remote success', async () => {
  const client = new AppNostrClient();
  client.setBackend(backend());
  assert.deepEqual(await client.publish({ id: 'signed' }), { queued: true, remoteAccepted: false });
});

test('cached events remain readable when the network history times out', async () => {
  const client = new AppNostrClient();
  const source = backend();
  client.setBackend(source);
  const pending = client.fetchEvents({ kinds: [1] });
  await Promise.resolve();
  const sub = [...source.subscriptions.values()][0];
  sub.event({ id: 'saved' });
  sub.history({ complete: false, reason: 'timeout' });
  assert.deepEqual([...await pending], [{ id: 'saved' }]);
  assert.equal(source.subscriptions.size, 0);
});

test('exact ID lookup resolves a retained event before slow network history completes', async () => {
  const client = new AppNostrClient();
  const source = backend();
  client.setBackend(source);
  const event = { id: 'a'.repeat(64), created_at: 1 };
  const pending = client.fetchEvent(event.id);
  await Promise.resolve();
  const sub = [...source.subscriptions.values()][0];
  sub.event(event);
  // A cache hit must release its subscription without waiting for EOSE.
  const releasedBeforeHistory = source.subscriptions.size === 0;
  sub.history({ complete: true, reason: 'eose' });
  assert.equal(await pending, event);
  assert.equal(releasedBeforeHistory, true);
});

test('prefix and replaceable lookups retain complete-history newest-event selection', async () => {
  for (const filter of ['a'.repeat(8), { kinds: [0], authors: ['b'.repeat(64)] }]) {
    const client = new AppNostrClient();
    const source = backend();
    client.setBackend(source);
    const pending = client.fetchEvent(filter);
    await Promise.resolve();
    const sub = [...source.subscriptions.values()][0];
    sub.event({ id: 'a'.repeat(64), created_at: 1 });
    assert.equal(source.subscriptions.size, 1);
    const newest = { id: 'a'.repeat(63) + 'b', created_at: 2 };
    sub.event(newest);
    sub.history({ complete: true, reason: 'eose' });
    assert.equal(await pending, newest);
    assert.equal(source.subscriptions.size, 0);
  }
});
