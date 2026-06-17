import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearCopyReset,
  copyToClipboard,
  scheduleCopyReset,
  truncateMiddle,
} from './clipboard.ts';

test('truncateMiddle preserves short text and shortens long text symmetrically', () => {
  assert.equal(truncateMiddle('abc', 10), 'abc');
  assert.equal(truncateMiddle('abcdefghijklmnopqrstuvwxyz', 11), 'abcd...wxyz');
  assert.equal(truncateMiddle('abcdef', 3), 'abc');
});

test('copyToClipboard fails softly without browser clipboard', async () => {
  assert.equal(await copyToClipboard('hello'), 'failed');
});

test('scheduleCopyReset clears a previous timer before scheduling the next one', () => {
  let resetCount = 0;
  const first = scheduleCopyReset(null, () => {
    resetCount += 1;
  }, 1_000);
  const second = scheduleCopyReset(first, () => {
    resetCount += 1;
  }, 1_000);
  clearCopyReset(second);
  assert.equal(resetCount, 0);
});
