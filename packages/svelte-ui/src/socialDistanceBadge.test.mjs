import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const badgeSource = readFileSync(new URL('./SocialDistanceBadge.svelte', import.meta.url), 'utf8');
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
