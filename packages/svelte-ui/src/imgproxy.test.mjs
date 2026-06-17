import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_IMGPROXY_CONFIG,
  IMGPROXY_SETTINGS_STORAGE_KEY,
  generateProxyUrl,
  loadImgProxySettings,
  normalizeImgProxySettings,
  resolveImgProxyUrl,
  saveImgProxySettings,
} from './imgproxy.ts';

test('generateProxyUrl signs and sizes remote image URLs', async () => {
  const url = await generateProxyUrl('https://m.primal.net/LwhG.jpg', {
    width: 40,
    height: 40,
    square: true,
  });

  assert.match(url, /^https:\/\/imgproxy\.iris\.to\//);
  assert.match(url, /\/rs:fill:40:40\/dpr:2\//);
  assert.ok(!url.includes('m.primal.net/LwhG.jpg'));
});

test('generateProxyUrl leaves local and already proxied URLs alone', async () => {
  assert.equal(await generateProxyUrl('/avatar.png'), '/avatar.png');
  assert.equal(await generateProxyUrl('data:image/png;base64,abc'), 'data:image/png;base64,abc');
  assert.equal(await generateProxyUrl(`${DEFAULT_IMGPROXY_CONFIG.url}/sig/path`), `${DEFAULT_IMGPROXY_CONFIG.url}/sig/path`);
});

test('resolveImgProxyUrl respects disabled settings', async () => {
  assert.equal(
    await resolveImgProxyUrl('https://example.com/avatar.png', { width: 32 }, { enabled: false }),
    'https://example.com/avatar.png',
  );
});

test('imgproxy settings normalize and persist defaults', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  const saved = saveImgProxySettings({ url: ' https://proxy.example ', enabled: false }, storage);
  assert.equal(saved.url, 'https://proxy.example');
  assert.equal(saved.key, DEFAULT_IMGPROXY_CONFIG.key);
  assert.equal(saved.enabled, false);
  assert.equal(JSON.parse(values.get(IMGPROXY_SETTINGS_STORAGE_KEY)).url, 'https://proxy.example');
  assert.deepEqual(loadImgProxySettings(storage), saved);
  assert.equal(normalizeImgProxySettings({ fallbackToOriginal: true }).fallbackToOriginal, true);
});
