import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
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
  assert.notEqual(fallbackIdentityName('abc'), '');
});
