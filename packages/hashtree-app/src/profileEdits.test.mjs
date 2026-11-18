import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { AppNostrClient } from './nostr.ts';
import { readOwnProfileHead, saveOwnProfileEdits } from './profileEdits.ts';

function fixture() {
  const key = generateSecretKey(), pubkey = getPublicKey(key);
  const sign = (content, created_at, tags = []) => finalizeEvent({kind:0,content:JSON.stringify(content),created_at,tags},key);
  const client = new AppNostrClient(), events = [], published = [], listeners = new Map();
  const settings = {complete:true, receipt:{accepted:false,queued:true}};
  client.signer = { getPublicKey:()=>pubkey, signEvent:draft=>finalizeEvent(draft,key) };
  client.setBackend({
    subscribe(_, onEvent, onHistory) {
      const id=String(Math.random()); listeners.set(id,onEvent);
      for (const evt of events) onEvent(evt);
      onHistory({complete:settings.complete,reason:'fixture'});
      return id;
    },
    unsubscribe(id){ listeners.delete(id); },
    async publish(event){ published.push(event); return settings.receipt; },
  });
  return {client,pubkey,settings,sign,events,published,listeners,key};
}

test('requires complete history and a verified raw base before publishing', async () => {
  const f=fixture(), base=f.sign({name:'old'},5);
  assert.equal(await readOwnProfileHead(f.client,f.pubkey),null);
  f.events.push({...base,content:'{}'});
  await assert.rejects(readOwnProfileHead(f.client,f.pubkey),/incomplete/);
  f.events[0]=base; f.settings.complete=false;
  await assert.rejects(saveOwnProfileEdits(f.client,f.pubkey,null,{about:'x'}),/incomplete/);
  f.settings.complete=true;
  await assert.rejects(saveOwnProfileEdits(f.client,f.pubkey,{...base,content:'{}'},{about:'x'}),/verified/);
  assert.equal(f.published.length,0);
  assert.equal(f.listeners.size,0);
});

test('selects the signed latest event, carries unrelated edits and refuses overlapping ones', async()=>{
  const f=fixture(), base=f.sign({name:'old'},5), newer=f.sign({name:'new',bot:false,custom:{x:1}},8,[['custom','a']]);
  f.events.push(newer,base);
  assert.equal((await readOwnProfileHead(f.client,f.pubkey)).id,newer.id);
  await assert.rejects(saveOwnProfileEdits(f.client,f.pubkey,base,{name:'ours'}),/another client/);
  const saved=await saveOwnProfileEdits(f.client,f.pubkey,base,{about:'ours'});
  assert.deepEqual(JSON.parse(saved.content),{name:'new',bot:false,custom:{x:1},about:'ours'});
  assert.deepEqual(saved.tags,newer.tags);
  assert.equal(f.published.length,1);
  assert.equal(f.listeners.size,0);
});

test('a newly observed head during external signing cancels publication', async()=>{
  const f=fixture(), base=f.sign({name:'old'},5), newer=f.sign({name:'new'},8);
  f.events.push(base);
  f.client.signer.signEvent=async draft=>{
    for (const emit of f.listeners.values()) emit(newer);
    return finalizeEvent(draft,f.key);
  };
  await assert.rejects(saveOwnProfileEdits(f.client,f.pubkey,base,{about:'ours'}),/during signing/);
  assert.equal(f.published.length,0);
});

test('validates the signer and exact returned payload', async()=>{
  const f=fixture(); f.client.signer.signEvent=draft=>finalizeEvent({...draft,tags:[['changed']]},f.key);
  await assert.rejects(saveOwnProfileEdits(f.client,f.pubkey,null,{name:'hello'}),/different profile/);
  f.client.signer.getPublicKey=()=> 'f'.repeat(64);
  await assert.rejects(saveOwnProfileEdits(f.client,f.pubkey,null,{name:'hello'}),/profile owner/);
  assert.equal(f.published.length,0);
});

test('serializes writes to the accepted head even before the backend echoes it', async()=>{
  const f=fixture(), base=f.sign({name:'old'},5);
  f.events.push(base);
  const [, newest]=await Promise.all([saveOwnProfileEdits(f.client,f.pubkey,base,{about:'one'}),saveOwnProfileEdits(f.client,f.pubkey,base,{website:'two'})]);
  assert.deepEqual(JSON.parse(newest.content),{name:'old',about:'one',website:'two'});
  assert.equal(f.published.length,2);
  assert.ok(newest.created_at > f.published[0].created_at);
});

test('only a successful durable queue or remote acceptance can acknowledge publication', async()=>{
  const f=fixture();
  f.settings.receipt={accepted:false,queued:false,remoteAccepted:false};
  await assert.rejects(saveOwnProfileEdits(f.client,f.pubkey,null,{name:'Fixture'}),/not accepted/);
  assert.equal(await readOwnProfileHead(f.client,f.pubkey),null);
  f.settings.receipt={accepted:false,queued:true,remoteAccepted:false};
  const saved=await saveOwnProfileEdits(f.client,f.pubkey,null,{name:'Fixture'});
  assert.equal((await readOwnProfileHead(f.client,f.pubkey)).id,saved.id);
});
