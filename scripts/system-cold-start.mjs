import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const BASE_URL = (process.env.CV_ENGINE_E2E_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isoSafe(value) {
  return value.replace(/[:.]/g, '-');
}

function gitHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function dockerCompose(...args) {
  return execFileSync('docker', ['compose', ...args], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

function identifiedCompose(...args) {
  const result = spawnSync(process.execPath, ['scripts/docker-compose-identified.mjs', ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Identified Docker Compose failed with exit ${result.status}.`);
}

async function health() {
  const response = await fetch(`${BASE_URL}/api/health`, { headers: { 'cache-control': 'no-cache' } });
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { statusCode: response.status, body };
}

async function waitForReady(expectedSha, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await health();
      if (
        last.statusCode === 200
        && last.body?.status === 'READY'
        && last.body?.identity?.buildSha === expectedSha
        && last.body?.identity?.releaseQualifiableIdentity === true
      ) {
        return last;
      }
    } catch {
      // Container may not be listening yet.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }
  throw new Error(`Docker stack did not reach identified READY state within ${timeoutMs}ms. Last state: ${JSON.stringify(last)}`);
}

async function main() {
  const repetitions = Number(argValue('--repetitions') || 3);
  const timeoutMs = Number(process.env.CVENGINE_COLD_START_TIMEOUT_MS || 300000);
  if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error('--repetitions must be a positive integer.');
  if (!process.env.CVENGINE_RUNTIME_PROFILE_ID?.trim()) {
    throw new Error('Set CVENGINE_RUNTIME_PROFILE_ID before cold-start characterization.');
  }

  const expectedSha = gitHead();
  const outputDir = resolve(process.env.CVENGINE_SYSTEM_COLD_START_DIR || `evidence/system/cold-start/${isoSafe(new Date().toISOString())}`);
  await mkdir(outputDir, { recursive: true });

  // Build once with exact identity. Repetitions measure container/topology cold start,
  // not build throughput. Volumes are deliberately retained.
  identifiedCompose('build', 'app');

  const attempts = [];
  try {
    for (let index = 1; index <= repetitions; index += 1) {
      dockerCompose('down');
      const startedAt = new Date().toISOString();
      const started = performance.now();
      identifiedCompose('up', '-d');
      const ready = await waitForReady(expectedSha, timeoutMs);
      const readyLatencyMs = Math.round(performance.now() - started);
      const ps = dockerCompose('ps');
      const models = dockerCompose('exec', '-T', 'ollama', 'ollama', 'list');
      const attempt = {
        attempt: index,
        startedAt,
        readyAt: new Date().toISOString(),
        readyLatencyMs,
        expectedBuildSha: expectedSha,
        identity: ready.body.identity,
        health: ready.body,
        dockerPs: ps,
        ollamaModels: models,
        result: 'PASS',
      };
      attempts.push(attempt);
      await writeFile(resolve(outputDir, `attempt-${index}.json`), `${JSON.stringify(attempt, null, 2)}\n`, 'utf8');
      process.stdout.write(`Cold start ${index}/${repetitions}: PASS (${readyLatencyMs} ms)\n`);
    }
  } finally {
    // Keep the final characterized stack up for follow-on persona/fault runs.
  }

  const receipt = {
    receiptVersion: 'ats-sys-01-cold-start-v0.1',
    semantics: 'CONTAINERS_COLD_VOLUMES_RETAINED',
    volumesRetained: true,
    destructiveVolumeReset: false,
    expectedBuildSha: expectedSha,
    runtimeProfileId: process.env.CVENGINE_RUNTIME_PROFILE_ID,
    repetitions,
    attempts,
    result: attempts.length === repetitions && attempts.every((attempt) => attempt.result === 'PASS') ? 'PASS' : 'FAIL',
    latencyBudgetApplied: false,
    note: 'Ready latency is observational in v0.1. Fresh-install/model-download cold start is a separate, still-uncharacterized scenario.',
  };
  await writeFile(resolve(outputDir, 'cold-start-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  process.stdout.write(`Evidence: ${outputDir}\n`);
  if (receipt.result !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
