import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProfileDraft, compareFollowEvents, compareProfileEvents, conflictingProfileFields,
  diffProfileFields, readProfileFields,
} from './dist/index.js';

const profile = (content = '{}', tags = []) => ({content, tags, created_at: 15});
const key = n => n.toString(16).padStart(64, '0');

test('changes only named fields and retains opaque JSON values, timestamps and tag order', () => {
  const content = '{"__proto__":{},"about":"a,b: {\\"z\\"}","deep":{"huge":12345678901234567890123},"old":false,"x":42}';
  const base = profile(content, [['i','twitter:old','proof'], ['other','one','two'], ['other','one','two']]);
  const patch = JSON.parse('{"__proto__":{"ok":true},"about":"new","bot":true,"birthday":{"day":2},"nil":null}');
  patch.old = undefined;
  const next = buildProfileDraft(base, patch, 10);
  assert.equal(next.kind, 0);
  assert.equal(next.created_at, 16);
  assert.equal(next.content.includes('12345678901234567890123'), true);
  assert.deepEqual(JSON.parse(next.content), JSON.parse('{"__proto__":{"ok":true},"about":"new","deep":{"huge":12345678901234567890123},"x":42,"bot":true,"birthday":{"day":2},"nil":null}'));
  assert.deepEqual(next.tags, base.tags);
  assert.notEqual(next.tags[0], base.tags[0]);
  assert.equal(base.content, content);
  assert.deepEqual(readProfileFields(buildProfileDraft(null, {name:'New'}, 1).content), {name:'New'});
});

test('refuses a malformed or ambiguous base and values outside JSON', () => {
  for (const content of ['oops', 'null', '[]', '{"a":2,"a":3}']) {
    assert.throws(() => buildProfileDraft(profile(content), {about:'hi'}));
  }
  for (const value of [NaN, Infinity, {foo:undefined}, [Symbol()], BigInt(42)]) {
    assert.throws(() => buildProfileDraft(null, {custom:value}));
  }
  assert.throws(() => buildProfileDraft({...profile(),created_at:Infinity}, {}));
});

test('retains image metadata while any field references its URL', () => {
  const tags = [['imeta','url a','dim 20x20'], ['imeta','url orphan','x 00'], ['i','unknown']];
  const base = profile('{"picture":"a","banner":"a"}',tags);
  assert.deepEqual(buildProfileDraft(base, {picture:'b'}).tags, tags);
  assert.deepEqual(buildProfileDraft(base, {picture:'b',banner:undefined}).tags, tags.slice(1));
});

test('patch and conflict detection distinguish absence, null, false and equivalent nested objects', () => {
  const before = JSON.parse('{"__proto__":true,"foo":{"a":1,"b":2},"x":false,"n":0}');
  const after = {foo:{b:2,a:1},x:null,n:0};
  const edits = diffProfileFields(before, after);
  assert.deepEqual(Object.keys(edits).sort(), ['__proto__','x']);
  assert.equal(edits.__proto__, undefined);
  assert.equal(edits.x, null);
  assert.deepEqual(conflictingProfileFields(before, {...before,other:'new'}, edits), []);
  assert.deepEqual(conflictingProfileFields(before, {...before,x:'remote'}, edits), ['x']);
  assert.deepEqual(conflictingProfileFields(before, after, edits), []);
});

test('profile diff shows additions, edits, blanked fields, duplicate tag removals and reordered tags', () => {
  const before = profile('{"name":"A","picture":"B","about":"C","bot":false}', [['x','1'],['x','1'],['y']]);
  const after = profile('{"name":"A","about":"  ","bot":false,"extra":[2]}', [['y'],['x','1']]);
  const result = compareProfileEvents(before, after);
  assert.deepEqual(result.fields, [
    {key:'picture',before:'B'}, {key:'about',before:'C',after:'  '}, {key:'extra',after:[2]},
  ]);
  assert.deepEqual(result.tagsRemoved, [['x','1']]);
  assert.equal(result.massRemoval, false);
  assert.equal(compareProfileEvents(before, profile('{"name":"A","bot":null,"about":"","picture":""}')).massRemoval, true);
  assert.equal(compareProfileEvents(profile('{"name":"A"}'), profile()).massRemoval, true);
  assert.equal(compareProfileEvents(before, {...before,tags:[['y'],['x','1'],['x','1']]}).tagsReordered, true);
});

test('follow diff counts people once, keeps positional hints, and reports opaque tags and legacy content', () => {
  const a = key(1), b = key(2), c = key(3);
  const before = profile('{"relay":{}}', [['p',a,'','Alice'],['p',a],['p',b],['flag','a']]);
  const after = profile('', [['p',c],['p',a,'wss://example.test','Alice'],['p',a],['flag','b']]);
  const result = compareFollowEvents(before, after);
  assert.deepEqual(result.added, [c]);
  assert.deepEqual(result.removed, [b]);
  assert.deepEqual(result.changed, [a]);
  assert.deepEqual(result.changes[0], {pubkey:a,before:before.tags.slice(0,2),after:after.tags.slice(1,3)});
  assert.deepEqual(result.tagsRemoved, [['flag','a']]);
  assert.deepEqual(result.tagsAdded, [['flag','b']]);
  assert.equal(result.contentChanged, true);
  assert.equal(result.massRemoval, false);
  assert.equal(compareFollowEvents(before, {...before,tags:[before.tags[2],...before.tags.slice(0,2),before.tags[3]]}).tagsReordered, true);
});

test('warns for a complete follow wipe or at least ten people and half of the list', () => {
  const people = profile('', Array.from({length:40}, (_, n) => ['p',key(n)]));
  const drop = n => compareFollowEvents(people, profile('',people.tags.slice(n))).massRemoval;
  assert.equal(drop(19), false);
  assert.equal(drop(20), true);
  assert.equal(drop(40), true);
  assert.equal(compareFollowEvents(profile('',[['p',key(1)]]), profile('')).massRemoval, true);
  assert.equal(compareFollowEvents(profile(''), profile('')).massRemoval, false);
});
