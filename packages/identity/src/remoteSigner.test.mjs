import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finalizeEvent, getPublicKey, nip44, verifyEvent } from 'nostr-tools';
import { connectRemoteNostrIdentitySigner } from './remoteSigner.ts';

const bunkerKey = new Uint8Array(32).fill(11);
const signingKey = new Uint8Array(32).fill(12);
const clientKey = new Uint8Array(32).fill(13);
const bunkerPubkey = getPublicKey(bunkerKey);
const clientPubkey = getPublicKey(clientKey);
const relay = 'wss://signer.example/';

function remote({ silent = false, mutate = false } = {}) {
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
      if (request.method === 'connect') result = 'ack';
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
      queueMicrotask(() => { for (const receive of listeners) receive(response); });
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
