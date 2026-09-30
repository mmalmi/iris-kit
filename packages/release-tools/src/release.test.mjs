import assert from 'node:assert/strict';
import test from 'node:test';

import { createReleasePlan, runReleasePlan } from './release.mjs';

const profile = {
  appName: 'Release fixture',
  buildCommand: ['build'],
  defaultWorkerName: undefined,
  distDir: 'dist',
  pagesProjectEnv: 'PAGES_PROJECT',
  testCommands: [],
  workerNameEnv: 'WORKER_NAME',
};
const options = {
  branch: undefined,
  dryRun: false,
  pagesProject: undefined,
  skipCloudflare: true,
  treeName: 'release-fixture',
  workerName: undefined,
};

function createPlan(releaseOptions = options) {
  return createReleasePlan({
    appDir: '/release-fixture',
    options: releaseOptions,
    profile,
    resolveHtreeCommand: (...args) => ['htree', ...args],
    wranglerVersion: '0.0.0',
  });
}

test('keeps Hashtree publication and Cloudflare deployment parallel before a retry', async () => {
  const releaseOptions = {
    ...options,
    pagesProject: 'release-fixture',
    skipCloudflare: false,
  };
  const started = new Set();
  let releaseBoth;
  const bothStarted = new Promise((resolve) => {
    releaseBoth = resolve;
  });
  const calls = [];

  const result = await runReleasePlan(releaseOptions, createPlan(releaseOptions), async (step) => {
    calls.push(step.id);
    if (step.id === 'publish' || step.id === 'deploy') {
      started.add(step.id);
      if (started.size === 2) releaseBoth();
      await bothStarted;
    }
    if (step.id === 'publish') {
      return {
        status: 0,
        stdout: 'published: npub1example/release-fixture\nnhash1ace',
        stderr: 'file server push failed',
      };
    }
    if (step.id === 'deploy') {
      return { status: 0, stdout: 'https://release-fixture.pages.dev', stderr: '' };
    }
    if (step.id === 'push') {
      return { status: 0, stdout: 'Uploaded: 3, Skipped: 0, Errors: 0', stderr: '' };
    }
    return { status: 0, stdout: '', stderr: '' };
  }, { buildOutputExists: () => true });

  assert.deepEqual([...started].sort(), ['deploy', 'publish']);
  assert.equal(calls.at(-1), 'push');
  assert.equal(result.pagesUrl, 'https://release-fixture.pages.dev');
});

test('retries a status-zero htree file-server soft failure with the published nhash', async () => {
  const calls = [];
  const result = await runReleasePlan(options, createPlan(), async (step) => {
    calls.push(step);
    if (step.id === 'publish') {
      return {
        status: 0,
        stdout: 'published: npub1example/release-fixture\nnhash1ace',
        stderr: 'file server push failed: temporary upload failure',
      };
    }
    if (step.id === 'push') {
      return { status: 0, stdout: 'Uploaded: 3, Skipped: 0, Errors: 0', stderr: '' };
    }
    return { status: 0, stdout: '', stderr: '' };
  }, { buildOutputExists: () => true });

  assert.deepEqual(calls.at(-1), {
    id: 'push',
    label: 'Retry Release fixture file-server upload',
    command: ['htree', 'push', 'nhash1ace', '--force'],
    cwd: '/release-fixture/dist',
  });
  assert.equal(result.publish.nhash, 'nhash1ace');
});

test('rejects a status-zero htree retry that reports a nonzero error count', async () => {
  await assert.rejects(
    runReleasePlan(options, createPlan(), async (step) => {
      if (step.id === 'publish') {
        return {
          status: 0,
          stdout: 'published: npub1example/release-fixture\nnhash1ace\nErrors: 1',
          stderr: '',
        };
      }
      if (step.id === 'push') {
        return { status: 0, stdout: 'Uploaded: 2, Skipped: 0, Errors: 1', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    }, { buildOutputExists: () => true }),
    /Retry Release fixture file-server upload completed with file-server errors/,
  );
});
