import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_PUBLIC_RELAYS } from './defaultRelays.ts';
import { getFileIcon } from './fileIcon.ts';
import { filterByGitignore, parseGitignore } from './gitignore.ts';
import { resolvePublishLabels } from './publishLabels.ts';
import { buildRelayStatusSnapshot } from './relayStatusSnapshot.ts';

test('default relays include the shared Iris relay set', () => {
  assert.deepEqual(DEFAULT_PUBLIC_RELAYS, [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://relay.nostr.band',
    'wss://relay.snort.social',
    'wss://temp.iris.to',
  ]);
});

test('file icons match common media and source extensions', () => {
  assert.equal(getFileIcon('cover.png'), 'i-lucide-image');
  assert.equal(getFileIcon('clip.webm'), 'i-lucide-video');
  assert.equal(getFileIcon('main.ts'), 'i-lucide-file-code');
  assert.equal(getFileIcon('archive.zip'), 'i-lucide-file-archive');
  assert.equal(getFileIcon('README'), 'i-lucide-file');
});

test('publish labels preserve order and remove duplicates', () => {
  assert.deepEqual(resolvePublishLabels({
    currentLabels: ['drive', 'git'],
    explicitLabels: ['docs', 'drive'],
    includeGitLabel: true,
  }), ['drive', 'git', 'docs']);
  assert.equal(resolvePublishLabels(), undefined);
});

test('gitignore filtering honors parent directories', () => {
  const patterns = parseGitignore('node_modules/\n!important.txt\n*.log');
  const result = filterByGitignore([
    { relativePath: 'src/index.ts' },
    { relativePath: 'node_modules/pkg/index.js' },
    { relativePath: 'debug.log' },
  ], patterns);
  assert.deepEqual(result.included.map((file) => file.relativePath), ['src/index.ts']);
  assert.deepEqual(result.excluded.map((file) => file.relativePath), ['node_modules/pkg/index.js', 'debug.log']);
});

test('relay snapshot merges configured and discovered relays', () => {
  const snapshot = buildRelayStatusSnapshot(
    ['wss://relay.example/', 'wss://backup.example'],
    [
      { url: 'wss://relay.example', connected: true },
      { url: 'ws://127.0.0.1:7777', connected: true },
      { url: 'wss://other.example', connected: false },
    ],
  );

  assert.equal(snapshot.connectedRelays, 2);
  assert.equal(snapshot.relayStatuses.get('wss://relay.example'), 'connected');
  assert.equal(snapshot.relayStatuses.get('wss://backup.example'), 'disconnected');
  assert.deepEqual(snapshot.discoveredRelays, [{ url: 'wss://other.example', status: 'disconnected' }]);
  assert.equal(snapshot.transportRelays.length, 3);
});
