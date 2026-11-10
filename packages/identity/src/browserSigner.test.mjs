import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { WebSocketServer } from 'ws';
import { generateSecretKey, getPublicKey, finalizeEvent, verifyEvent, nip44 } from 'nostr-tools';
import { pairBrowserSigner, restoreBrowserSigner, isBrowserSignerSession } from './browserSigner.ts';

test('pairs, restores offline, signs and encrypts with a single-use link on the selected relay', async t => {
  const relay = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(relay, 'listening');
  t.after(() => { for (const socket of relay.clients) socket.terminate(); relay.close(); });
  const remote = generateSecretKey();
  let owner = generateSecretKey();
  const requests = [];
  relay.on('connection', socket => {
    let subscription;
    socket.on('message', raw => {
      const [type, value] = JSON.parse(raw);
      if (type === 'REQ') { subscription = value; return; }
      if (type !== 'EVENT') return;
      assert.ok(subscription, 'REQ precedes EVENT on the same socket');
      assert.equal(verifyEvent(value), true);
      socket.send(JSON.stringify(['OK', value.id, true, '']));
      const conversation = nip44.v2.utils.getConversationKey(remote, value.pubkey);
      const { method, params, id } = JSON.parse(nip44.v2.decrypt(value.content, conversation));
      requests.push({ method, params });
      let result;
      switch (method) {
        case 'connect': result = 'ack'; break;
        case 'get_public_key': result = getPublicKey(owner); break;
        case 'switch_relays': result = 'null'; break;
        case 'sign_event': result = JSON.stringify(finalizeEvent(JSON.parse(params[0]), owner)); break;
        case 'nip44_encrypt': result = nip44.v2.encrypt(params[1], nip44.v2.utils.getConversationKey(owner, params[0])); break;
        case 'nip44_decrypt': result = nip44.v2.decrypt(params[1], nip44.v2.utils.getConversationKey(owner, params[0])); break;
        default: assert.fail(method);
      }
      const reply = finalizeEvent({ kind: 24133, tags: [['p', value.pubkey]], created_at: Math.floor(Date.now()/1000),
        content: nip44.v2.encrypt(JSON.stringify({ id, result }), conversation) }, remote);
      socket.send(JSON.stringify(['EVENT', subscription, reply]));
    });
  });
  const url = 'ws://127.0.0.1:' + relay.address().port;
  const connection = 'bunker://' + getPublicKey(remote) + '?relay=' + encodeURIComponent(url) + '&secret=once';
  const session = await pairBrowserSigner(connection, { name: 'Test', permissions: 'sign_event,nip44_encrypt,nip44_decrypt' });
  assert.ok(!JSON.stringify(session).includes('once'));
  assert.equal(isBrowserSignerSession({ ...session, connection }), false);
  const signer = restoreBrowserSigner(JSON.parse(JSON.stringify(session)));
  assert.equal(signer.getPublicKey(), getPublicKey(owner));
  const draft = { kind: 1, content: 'local test', created_at: 100, tags: [] };
  assert.equal((await signer.signEvent(draft)).id, finalizeEvent(draft, owner).id);
  const encrypted = await signer.nip44Encrypt(session.pubkey, 'private');
  assert.equal(await signer.nip44Decrypt(session.pubkey, encrypted), 'private');
  owner = generateSecretKey();
  await assert.rejects(signer.signEvent(draft));
  assert.equal(requests.at(-1).method, 'get_public_key');
  assert.equal(requests.filter(x => x.method === 'connect').length, 1);
});
