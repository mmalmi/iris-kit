import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finalizeEvent, getPublicKey, nip44, verifyEvent } from 'nostr-tools';
import { connectRemoteNostrIdentitySigner, parseBunkerConnection } from './remoteSigner.ts';

const bunkerKey = new Uint8Array(32).fill(11);
const signingKey = new Uint8Array(32).fill(12);
const clientKey = new Uint8Array(32).fill(13);
const bunkerPubkey = getPublicKey(bunkerKey);
const clientPubkey = getPublicKey(clientKey);
const relay = 'wss://signer.example/';

function remote({ silent = false, mutate = false, confirmation = 'ack', auth, switched = null } = {}) {
  const listeners = new Set();
  const requests = [];
  return {
    listeners, requests,
    subscribe(relays, filters, receive) {
      assert.deepEqual(relays, [relay]);
      assert.deepEqual(filters[0].authors, [bunkerPubkey]);
      assert.deepEqual(filters[0]['#p'], [clientPubkey]);
      listeners.add(receive); return { close: () => listeners.delete(receive) };
    },
    async publish(relays, event) {
      assert.deepEqual(relays, [relay]); assert.equal(verifyEvent(event), true);
      assert.equal(event.pubkey, clientPubkey);
      const conversation = nip44.v2.utils.getConversationKey(bunkerKey, event.pubkey);
      const request = JSON.parse(nip44.v2.decrypt(event.content, conversation));
      requests.push(request);
      if (silent) return;
      let result;
      if (request.method === 'connect') result = confirmation;
      else if (request.method === 'switch_relays') result = JSON.stringify(switched);
      else if (request.method === 'get_public_key') result = getPublicKey(signingKey);
      else if (request.method === 'sign_event') {
        const draft = JSON.parse(request.params[0]);
        if (mutate) draft.content = 'changed remotely';
        result = JSON.stringify(finalizeEvent(draft, signingKey));
      } else if (request.method === 'nip44_encrypt') {
        result = nip44.v2.encrypt(request.params[1], nip44.v2.utils.getConversationKey(signingKey, request.params[0]));
      } else throw new Error(`Unexpected method ${request.method}`);
      const response = finalizeEvent({ kind: 24133, created_at: Math.floor(Date.now() / 1000), tags: [['p', event.pubkey]],
        content: nip44.v2.encrypt(JSON.stringify({ id: request.id, result }), conversation) }, bunkerKey);
      const challenge = auth && finalizeEvent({ kind: 24133, created_at: Math.floor(Date.now() / 1000), tags: [['p', event.pubkey]],
        content: nip44.v2.encrypt(JSON.stringify({ id: request.id, result: 'auth_url', error: auth }), conversation) }, bunkerKey);
      queueMicrotask(() => { for (const receive of listeners) { if (challenge) receive(challenge); receive(response); } });
    },
  };
}
function options(transport) {
  return { connection: `bunker://${bunkerPubkey}?relay=${encodeURIComponent(relay)}&secret=session-secret`, transport, clientSecretKey: clientKey, timeoutMs: 250 };
}

test('remote recovery signs and encrypts through the injected relay scope using an existing client key', async () => {
  const transport = remote(); const signer = await connectRemoteNostrIdentitySigner(options(transport));
  try {
    assert.equal(signer.method, 'nip46'); assert.equal(await signer.getPublicKey(), getPublicKey(signingKey));
    const draft = { kind: 0, created_at: 100, content: 'recovered identity', tags: [] };
    const signed = await signer.signEvent(draft);
    assert.equal(verifyEvent(signed), true); assert.equal(signed.id, finalizeEvent(draft, signingKey).id);
    const encrypted = await signer.nip44Encrypt(clientPubkey, 'device key');
    assert.equal(nip44.v2.decrypt(encrypted, nip44.v2.utils.getConversationKey(clientKey, getPublicKey(signingKey))), 'device key');
    assert.deepEqual(transport.requests[0].params, [bunkerPubkey, 'session-secret']);
  } finally { await signer.close(); }
  assert.equal(transport.listeners.size, 0);
  await assert.rejects(signer.getPublicKey(), /closed/);
});

test('remote recovery rejects a valid signature for a changed draft', async () => {
  const transport = remote({ mutate: true }); const signer = await connectRemoteNostrIdentitySigner(options(transport));
  try { await assert.rejects(signer.signEvent({ kind: 0, created_at: 100, content: 'expected', tags: [] }), /content|match/); }
  finally { await signer.close(); }
});

test('remote recovery times out and releases the response subscription', async () => {
  const transport = remote({ silent: true });
  await assert.rejects(connectRemoteNostrIdentitySigner({ ...options(transport), timeoutMs: 20 }), /did not respond/);
  assert.equal(transport.listeners.size, 0);
});

test('bunker links validate the key and relay scope without network discovery', () => {
  assert.deepEqual(parseBunkerConnection(options(remote()).connection), {pubkey:bunkerPubkey, relays:[relay], secret:'session-secret'});
  for (const input of ['person@example.com', `bunker://${bunkerPubkey}`, `bunker://${bunkerPubkey}/other?relay=${relay}`,
    `bunker://${bunkerPubkey}?relay=https://example.com`, `bunker://${bunkerPubkey}?relay=wss://user:password@example.com`,
    `bunker://${bunkerPubkey}?relay=${relay}#fragment`]) assert.throws(() => parseBunkerConnection(input));
});

test('pairing sends permissions and metadata and returns a secret-free resumable connection', async () => {
  const transport = remote({confirmation:'session-secret'});
  const signer = await connectRemoteNostrIdentitySigner({...options(transport), permissions:'sign_event', clientMetadata:{name:'Example'}, switchRelays:true});
  assert.deepEqual(transport.requests[0].params, [bunkerPubkey, 'session-secret', 'sign_event', '{"name":"Example"}']);
  assert.equal(signer.connection.includes('secret'), false);
  const saved = signer.connection;
  await signer.close();
  const restoredTransport = remote();
  const restored = await connectRemoteNostrIdentitySigner({...options(restoredTransport), connection:saved, resume:true});
  assert.deepEqual(restoredTransport.requests.map(request => request.method), ['get_public_key']);
  await restored.signEvent({kind:1, content:'after reload', tags:[], created_at:100});
  await restored.close();
  assert.equal(clientKey[0], 13, 'closing must not wipe the caller-owned persistence key');
});

test('pairing rejects an unexpected confirmation and invalid switched relays', async () => {
  for (const transport of [remote({confirmation:'wrong secret'}), remote({switched:['https://example.com']})]) {
    await assert.rejects(connectRemoteNostrIdentitySigner({...options(transport), switchRelays:true}));
    assert.equal(transport.listeners.size, 0);
  }
});

test('cancelling a pending pairing releases subscriptions immediately', async () => {
  const transport = remote({silent:true}), controller = new AbortController();
  const pending = connectRemoteNostrIdentitySigner({...options(transport), signal:controller.signal});
  controller.abort();
  await assert.rejects(pending);
  assert.equal(transport.listeners.size, 0);
});

test('closing interrupts pending signing requests, and already-aborted calls never subscribe', async () => {
  const transport = remote();
  const signer = await connectRemoteNostrIdentitySigner(options(transport));
  transport.publish = async () => {};
  const pending = signer.signEvent({kind:1, content:'pending', tags:[], created_at:100});
  await signer.close();
  await assert.rejects(pending, /closed/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(connectRemoteNostrIdentitySigner({...options(transport), signal:controller.signal}));
  assert.equal(transport.listeners.size, 0);
});

test('only safe authorization links reach the caller', async () => {
  for (const auth of ['javascript:alert(1)', 'https://user:pass@example.com', 'https://signer.example/approve']) {
    const links = [], transport = remote({auth});
    const signer = await connectRemoteNostrIdentitySigner({...options(transport), onAuth:url => links.push(url)});
    assert.equal(links.length > 0, auth === 'https://signer.example/approve');
    await signer.close();
  }
});
