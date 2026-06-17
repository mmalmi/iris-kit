import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const avatarSource = readFileSync(new URL('./Avatar.svelte', import.meta.url), 'utf8');
const proxyImgSource = readFileSync(new URL('./ProxyImg.svelte', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('ProxyImg is exported as a shared Svelte UI component', () => {
  assert.deepEqual(packageJson.exports['./ProxyImg.svelte'], {
    svelte: './src/ProxyImg.svelte',
    default: './src/ProxyImg.svelte',
  });
});

test('Avatar delegates remote image handling to ProxyImg', () => {
  assert.match(avatarSource, /import ProxyImg from '\.\/ProxyImg\.svelte';/);
  assert.match(avatarSource, /<ProxyImg/);
  assert.doesNotMatch(avatarSource, /<img[\s>]/);
});

test('ProxyImg resolves proxied URLs and can fall back to originals', () => {
  assert.match(proxyImgSource, /resolveImgProxyUrl/);
  assert.match(proxyImgSource, /loadOriginalIfProxyFails/);
  assert.match(proxyImgSource, /onProxyFailed/);
});
