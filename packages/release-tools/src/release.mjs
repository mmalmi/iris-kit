// @ts-nocheck
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export function cloneValues(values) {
  return values ? [...values] : [];
}

export function usesBuiltInWorker(profile, workerName) {
  return Boolean(profile.defaultWorkerName && workerName === profile.defaultWorkerName);
}

export function wranglerPagesCommand(wranglerVersion, ...args) {
  return ['npx', `wrangler@${wranglerVersion}`, ...args];
}

export function wranglerWorkerAssetsCommand(wranglerVersion, ...args) {
  return ['npx', `wrangler@${wranglerVersion}`, 'deploy', ...args];
}

export function workerAssetsDeployCommand(profile, options, wranglerVersion) {
  if (profile.workerScript) {
    return [
      'node',
      './scripts/deploy-worker-assets.mjs',
      '--script',
      profile.workerScript,
      '--assets',
      profile.distDir,
      '--name',
      options.workerName,
      '--compatibility-date',
      options.workerCompatibilityDate,
      '--wrangler-version',
      wranglerVersion,
    ];
  }

  return wranglerWorkerAssetsCommand(
    wranglerVersion,
    '--assets',
    profile.distDir,
    '--name',
    options.workerName,
    '--compatibility-date',
    options.workerCompatibilityDate,
    '--keep-vars',
  );
}

export function createReleasePlan({
  appDir,
  options,
  profile,
  resolveHtreeCommand,
  wranglerVersion,
}) {
  if (options.workerName && options.branch) {
    throw new Error('--branch is only supported for Pages deployments');
  }
  if (!options.skipCloudflare && !options.workerName && !options.pagesProject) {
    throw new Error(
      `Missing Cloudflare target. Pass --worker-name, --pages-project, or set ${profile.workerNameEnv} / ${profile.pagesProjectEnv}.`,
    );
  }

  const distDir = path.join(appDir, profile.distDir);
  const steps = [
    {
      id: 'build',
      label: `Build ${profile.appName}`,
      command: profile.buildCommand,
      cwd: appDir,
    },
    ...profile.testCommands.map((command, index) => ({
      id: `test-${index + 1}`,
      label: `Test ${profile.appName} (${index + 1}/${profile.testCommands.length})`,
      command,
      cwd: appDir,
    })),
    {
      id: 'publish',
      label: `Publish ${profile.appName} to hashtree`,
      command: resolveHtreeCommand('add', '.', '--publish', options.treeName),
      cwd: distDir,
    },
  ];

  if (!options.skipCloudflare) {
    const deployCommand = options.workerName
      ? workerAssetsDeployCommand(profile, options, wranglerVersion)
      : wranglerPagesCommand(
          wranglerVersion,
          'pages',
          'deploy',
          profile.distDir,
          '--project-name',
          options.pagesProject,
        );
    if (options.workerName) {
      for (const route of options.routes ?? []) {
        deployCommand.push('--route', route);
      }
      for (const domain of options.domains ?? []) {
        deployCommand.push('--domain', domain);
      }
    }
    if (options.pagesProject && options.branch) {
      deployCommand.push('--branch', options.branch);
    }
    steps.push({
      id: 'deploy',
      label: options.workerName
        ? `Deploy ${profile.appName} to Cloudflare Worker`
        : `Deploy ${profile.appName} to Cloudflare Pages`,
      command: deployCommand,
      cwd: appDir,
    });
  }

  return {
    profile,
    distDir,
    steps,
    htreePushCommand: resolveHtreeCommand('push'),
  };
}

function createOutputWriter(stream, suppressDisplayPatterns) {
  let pending = '';

  return {
    write(chunk) {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';

      for (const line of lines) {
        if (!suppressDisplayPatterns.some((pattern) => pattern.test(line))) {
          stream.write(`${line}\n`);
        }
      }
    },
    flush() {
      if (!pending) return;
      if (!suppressDisplayPatterns.some((pattern) => pattern.test(pending))) {
        stream.write(pending);
      }
      pending = '';
    },
  };
}

export function createDefaultRunner({
  env = process.env,
  suppressPublishDisplayPatterns = [/^\s*hash:\s+/i, /^\s*key:\s+/i],
} = {}) {
  return function defaultRunner(step) {
    const [command, ...args] = step.command;
    console.log(`\n==> ${step.label}`);
    console.log(`$ ${[command, ...args].join(' ')}`);

    const suppressDisplayPatterns = step.id === 'publish'
      ? suppressPublishDisplayPatterns
      : [];

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: step.cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      const stdoutWriter = createOutputWriter(process.stdout, suppressDisplayPatterns);
      const stderrWriter = createOutputWriter(process.stderr, suppressDisplayPatterns);

      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => {
        stdout += chunk;
        stdoutWriter.write(chunk);
      });

      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (chunk) => {
        stderr += chunk;
        stderrWriter.write(chunk);
      });

      child.on('error', reject);
      child.on('close', (code, signal) => {
        stdoutWriter.flush();
        stderrWriter.flush();
        if (signal) {
          const signalMessage = `Process exited with signal ${signal}\n`;
          stderr += signalMessage;
          process.stderr.write(signalMessage);
        }
        resolve({
          status: code ?? 1,
          stdout,
          stderr,
        });
      });
    });
  };
}

export const defaultRunner = createDefaultRunner();

export function ensureDistExists(distDir, buildOutputExists = existsSync) {
  if (!buildOutputExists(distDir)) {
    throw new Error(`Build output directory not found: ${distDir}`);
  }
}

export function parsePublishOutput(output) {
  const nhashMatch = output.match(/nhash1[ac-hj-np-z02-9]+/i);
  if (!nhashMatch) {
    throw new Error('Publish succeeded but no nhash was found in htree output');
  }

  const publishedMatch = output.match(/^\s*published:\s+(\S+)\s*$/im);
  if (!publishedMatch) {
    throw new Error('Publish succeeded but no mutable ref was found in htree output');
  }

  return {
    nhash: nhashMatch[0],
    publishedRef: publishedMatch[1],
  };
}

export function parseDeployOutputUrl(output) {
  const deployUrlMatch = output.match(/https:\/\/[^\s]+(?:\.pages\.dev|\.workers\.dev)(?:\/[^\s]*)?/i);
  return deployUrlMatch ? deployUrlMatch[0] : null;
}

export function isReleaseStep(step) {
  return step.id === 'publish' || step.id === 'deploy';
}

export function assertStepSucceeded(step, result) {
  if (result.status !== 0) {
    throw new Error(`${step.label} failed with exit code ${result.status}`);
  }
}

function hasFileServerErrors(result) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const hasNonzeroErrorCount = [...output.matchAll(/\bErrors:\s*(\d+)\b/gi)]
    .some(([, count]) => Number(count) > 0);
  return /file server push failed/i.test(output) || hasNonzeroErrorCount;
}

export async function runReleasePlan(
  options,
  plan,
  runner = defaultRunner,
  hooks = {},
) {
  const buildOutputExists = hooks.buildOutputExists ?? existsSync;

  if (options.dryRun) {
    return {
      dryRun: true,
      profile: plan.profile,
      steps: plan.steps,
    };
  }

  let publishOutput = '';
  let publishNeedsPush = false;
  let deployOutput = '';
  const prereleaseSteps = plan.steps.filter((step) => !isReleaseStep(step));
  const releaseSteps = plan.steps.filter(isReleaseStep);

  for (const step of prereleaseSteps) {
    const result = await runner(step);
    assertStepSucceeded(step, result);
    if (step.id === 'build') {
      ensureDistExists(plan.distDir, buildOutputExists);
    }
  }

  const releaseResults = await Promise.allSettled(
    releaseSteps.map((step) => Promise.resolve().then(() => runner(step))),
  );

  for (const [index, execution] of releaseResults.entries()) {
    const step = releaseSteps[index];
    if (execution.status === 'rejected') {
      throw execution.reason;
    }
    const result = execution.value;
    assertStepSucceeded(step, result);
    if (step.id === 'publish') {
      publishOutput = `${result.stdout}\n${result.stderr}`;
      publishNeedsPush = hasFileServerErrors(result);
    }
    if (step.id === 'deploy') {
      deployOutput = `${result.stdout}\n${result.stderr}`;
    }
  }

  const publish = parsePublishOutput(publishOutput);
  if (publishNeedsPush) {
    const pushStep = {
      id: 'push',
      label: `Retry ${plan.profile.appName} file-server upload`,
      command: [...plan.htreePushCommand, publish.nhash, '--force'],
      cwd: plan.distDir,
    };
    const result = await runner(pushStep);
    assertStepSucceeded(pushStep, result);
    if (hasFileServerErrors(result)) {
      throw new Error(`${pushStep.label} completed with file-server errors`);
    }
  }

  return {
    profile: plan.profile,
    treeName: options.treeName,
    publish,
    pagesUrl: deployOutput ? parseDeployOutputUrl(deployOutput) : null,
    pagesProject:
      options.skipCloudflare || options.workerName ? null : options.pagesProject ?? null,
    workerName: options.skipCloudflare ? null : options.workerName ?? null,
    routes: options.skipCloudflare || !options.workerName ? [] : options.routes ?? [],
    domains: options.skipCloudflare || !options.workerName ? [] : options.domains ?? [],
  };
}
