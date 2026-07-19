import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const indexSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const componentSource = readFileSync(new URL('./AvatarGroup.svelte', import.meta.url), 'utf8');

test('exports a reusable AvatarGroup component from the package and direct path', () => {
  assert.deepEqual(packageJson.exports['./AvatarGroup.svelte'], {
    svelte: './src/AvatarGroup.svelte',
    default: './src/AvatarGroup.svelte',
  });
  assert.match(indexSource, /export \{ default as AvatarGroup \} from '\.\/AvatarGroup\.svelte';/);
  assert.match(indexSource, /export type \{ AvatarGroupItem \} from '\.\/avatarGroup';/);
});

test('AvatarGroup renders bounded overlapping shared avatars with optional profile links', () => {
  assert.match(componentSource, /import Avatar from '\.\/Avatar\.svelte';/);
  assert.match(componentSource, /items\.slice\(0, normalizedMax\)/);
  assert.match(componentSource, /item\.href/);
  assert.match(componentSource, /margin-left/);
  assert.match(componentSource, /z-index/);
});
