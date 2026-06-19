import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const badgeSource = readFileSync(new URL('./SocialDistanceBadge.svelte', import.meta.url), 'utf8');
const userRowSource = readFileSync(new URL('./UserRow.svelte', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('SocialDistanceBadge is exported as a shared Svelte UI component', () => {
  assert.deepEqual(packageJson.exports['./SocialDistanceBadge.svelte'], {
    svelte: './src/SocialDistanceBadge.svelte',
    default: './src/SocialDistanceBadge.svelte',
  });
});

test('SocialDistanceBadge keeps iris social distance semantics', () => {
  assert.match(badgeSource, /distance\?: number \| null/);
  assert.match(badgeSource, /followedByFriends\?: number \| null/);
  assert.match(badgeSource, /Followed by your network/);
  assert.match(badgeSource, /data-testid="social-distance-badge"/);
});

test('UserRow can overlay social distance badges on avatars', () => {
  assert.match(userRowSource, /import SocialDistanceBadge/);
  assert.match(userRowSource, /badgeDistance\?: number \| null/);
  assert.match(userRowSource, /showBadge\?: boolean/);
  assert.match(userRowSource, /iris-user-row-avatar-badge/);
});
