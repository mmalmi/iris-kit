import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createContactMemoryStore } from './contactMemoryStore.ts';

const alice = 'a'.repeat(64), bob = 'b'.repeat(64), carol = 'c'.repeat(64);
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('remembered names persist per viewer and require exact approval', () => {
  const data = storage();
  const store = createContactMemoryStore(data);
  store.remember(alice, bob, 'Bob');
  store.remember(alice, bob, 'Robert');
  assert.equal(store.get(alice, bob).accepted_name, 'Bob');
  assert.equal(store.get(carol, bob), null);
  assert.equal(store.approve(alice, bob, 'Robert', 'Bobby', 100), false);
  assert.equal(store.approve(alice, bob, 'Robert', 'Robert', 100), true);
  const restored = createContactMemoryStore(data).get(alice, bob);
  assert.equal(restored.accepted_name, 'Robert');
  assert.equal(restored.first_seen_name, 'Bob');
  assert.deepEqual(restored.name_changes, [{previous_name: 'Bob', accepted_name: 'Robert', accepted_at_secs: 100}]);
});

test('known contacts wait for real metadata, browsing strangers does not remember them', () => {
  const store = createContactMemoryStore(storage());
  store.observeKnown(alice, bob, 'Bob');
  assert.equal(store.get(alice, bob), null);
  store.remember(alice, bob, null);
  store.observeKnown(alice, bob, 'Bob');
  assert.equal(store.get(alice, bob).first_seen_name, 'Bob');
  store.setFavorite(alice, bob, true, 'Robert');
  assert.equal(store.get(alice, bob).accepted_name, 'Bob');
  assert.equal(store.get(alice, bob).favorite, true);
  store.setFavorite(alice, bob, false, 'Robert');
  assert.equal(store.get(alice, bob).favorite, false);
});

test('invalid accounts do not save and storage failures remain visible', () => {
  const store = createContactMemoryStore(storage());
  store.remember('', bob, 'Bob');
  store.remember(alice, alice, 'Alice');
  assert.equal(store.get('', bob), null);
  assert.equal(store.get(alice, alice), null);
  const broken = createContactMemoryStore({getItem: () => null, setItem: () => { throw Error('full'); }});
  let notifications = 0;
  const unsubscribe = broken.subscribe(() => notifications++);
  assert.throws(() => broken.remember(alice, bob, 'Bob'), /full/);
  assert.equal(notifications, 1);
  unsubscribe();
});
