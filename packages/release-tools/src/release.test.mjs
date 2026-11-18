import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createNativeReleaseCommand, createReleasePlan, runReleasePlan } from './release.mjs';

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

const nativeProfile = { ...profile, nativeReleaseGate: true };
const gatePath = fileURLToPath(import.meta.url);
const nativeOptions = { ...options, skipCloudflare: false, pagesProject: 'release-fixture' };

function createNativePlan({ releaseOptions = nativeOptions, nativeReleaseGatePath = gatePath, resolveHtreeCommand = (...args) => ['htree', ...args] } = {}) {
  return createReleasePlan({
    appDir: '/release-fixture',
    options: releaseOptions,
    profile: nativeProfile,
    resolveHtreeCommand,
    nativeReleaseGatePath,
    wranglerVersion: '0.0.0',
  });
}

test('gated release invokes the canonical runner for the built artifact', () => {
  const publish = createNativePlan().steps.find(step => step.id === 'publish');
  assert.deepEqual(publish.command, [
    process.execPath, gatePath, '--dist', '/release-fixture/dist',
    '--tree', 'release-fixture', '--htree', 'htree',
  ]);
});

test('custom publishers forward the same entry points and storage options to the gate', () => {
  const command = createNativeReleaseCommand({
    distDir: '/release-fixture/dist',
    treeName: 'release-fixture',
    gatePath,
    resolveHtreeCommand: () => ['/published/bin/htree'],
    entries: ['/', '/decentralize/index.html'],
    legacyKeys: true,
    unencrypted: true,
  });
  assert.deepEqual(command.slice(2), [
    '--dist', '/release-fixture/dist', '--tree', 'release-fixture', '--htree', '/published/bin/htree',
    '--entry', '/', '--entry', '/decentralize/index.html', '--legacy-keys', '--unencrypted',
  ]);
});

test('requires a real absolute gate path and a standalone Hashtree CLI for live releases', () => {
  assert.throws(() => createNativePlan({ nativeReleaseGatePath: '' }), /IRIS_NATIVE_RELEASE_GATE/);
  assert.throws(() => createNativePlan({ nativeReleaseGatePath: 'release-gate.mjs' }), /IRIS_NATIVE_RELEASE_GATE/);
  assert.throws(() => createNativePlan({ nativeReleaseGatePath: '/nonexistent/release-gate.mjs' }), /IRIS_NATIVE_RELEASE_GATE/);
  assert.throws(() => createNativePlan({ resolveHtreeCommand: (...args) => ['cargo', 'run', '--', ...args] }), /HTREE_BIN/);
});

test('dry runs show the gate even when the gate path and publisher are missing', () => {
  const plan = createNativePlan({
    releaseOptions: { ...nativeOptions, dryRun: true },
    nativeReleaseGatePath: '',
    resolveHtreeCommand: (...args) => ['cargo', 'run', '--', ...args],
  });
  const command = plan.steps.find(step => step.id === 'publish').command;
  assert.equal(command[1], '$IRIS_NATIVE_RELEASE_GATE');
  assert.equal(command.at(-1), '$HTREE_BIN');
});

test('halts before deployment if the gate fails or only stages a candidate', async () => {
  for (const publishResult of [
    { status: 1, stdout: '', stderr: '' },
    { status: 0, stdout: 'url: nhash1ace\npublished: npub1example/release-fixture-candidate-123456abcdef', stderr: '' },
  ]) {
    const steps = [];
    await assert.rejects(runReleasePlan(nativeOptions, createNativePlan(), async step => {
      steps.push(step.id);
      return step.id === 'publish' ? publishResult : { status: 0, stdout: '', stderr: '' };
    }, { buildOutputExists: () => true }));
    assert.deepEqual(steps, ['build', 'publish']);
  }
});

test('deploys only after a native-gated promotion', async () => {
  const steps = [];
  const result = await runReleasePlan(nativeOptions, createNativePlan(), async step => {
    steps.push(step.id);
    if (step.id === 'publish') {
      return { status: 0, stdout: 'url: nhash1ace\npublished: npub1example/release-fixture', stderr: '' };
    }
    if (step.id === 'deploy') {
      return { status: 0, stdout: 'https://release-fixture.pages.dev', stderr: '' };
    }
    return { status: 0, stdout: '', stderr: '' };
  }, { buildOutputExists: () => true });
  assert.deepEqual(steps, ['build', 'publish', 'deploy']);
  assert.equal(result.publish.nhash, 'nhash1ace');
  assert.equal(result.pagesUrl, 'https://release-fixture.pages.dev');
});
