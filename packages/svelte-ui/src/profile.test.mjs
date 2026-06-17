import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  coolName,
  coolNameAdjectives,
  coolNameNouns,
  fallbackIdentityName,
  getProfileDisplayName,
  getProfileName,
  getProfilePicture,
} from './profile.ts';

test('profile names prefer explicit display fields', () => {
  assert.equal(getProfileName({ name: 'Name', display_name: 'Display' }), 'Display');
  assert.equal(getProfileName({ name: 'Name', displayName: 'Camel' }), 'Camel');
  assert.equal(getProfileDisplayName({ name: 'Name' }, 'abc'), 'Name');
  assert.equal(getProfileDisplayName({ name: 'Name' }, 'abc', 'Preferred'), 'Preferred');
  assert.equal(getProfileDisplayName(undefined, 'abc', undefined, 'Fallback'), 'Fallback');
});

test('profile picture accepts common nostr fields', () => {
  assert.equal(getProfilePicture({ picture: 'https://example.com/a.png' }), 'https://example.com/a.png');
  assert.equal(getProfilePicture({ image: 'https://example.com/b.png' }), 'https://example.com/b.png');
});

test('fallback names are deterministic and non-empty', () => {
  assert.equal(fallbackIdentityName('abc'), fallbackIdentityName('abc'));
  assert.equal(fallbackIdentityName('abc'), coolName('abc'));
  assert.notEqual(fallbackIdentityName('abc'), '');
});

test('cool names have enough word variance for shared app fallbacks', () => {
  assert.ok(coolNameAdjectives.length >= 80);
  assert.ok(coolNameNouns.length >= 80);
  assert.notEqual(coolName('abc'), coolName('def'));
});
