import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { captureCanonicalRuntimeIdentity } from './system-runtime-identity.mjs';

const BASE_URL = (process.env.CV_ENGINE_E2E_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const DEFAULT_IMPORT_MODEL = 'qwen3:1.7b';
const DEFAULT_OPTIMIZE_MODEL = 'qwen3:4b-instruct';

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

function serviceStartedAt(service) {
  try {
    const id = dockerCompose('ps', '-q', service).trim();
    if (!id) return null;
    const value = execFileSync('docker', ['inspect', '--format', '{{.State.StartedAt}}', id], {
      encoding: 'utf8',
    }).trim();
    return Number.isFinite(Date.parse(value)) ? value : null;
  } catch {
    return null;
  }
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

function resolvedModelsPresent(body) {
  const capabilities = body?.configuration?.status === 'RESOLVED'
    ? body.configuration.capabilities
    : null;
  return Boolean(
    capabilities?.resumeImport?.model
      && capabilities?.inlineOptimize?.model
      && capabilities?.resumeAssembly?.model,
  );
}

async function waitForReady(expectedSha, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last;
  const events = {
    trustedCoreReadyAt: null,
    redisReadyAt: null,
    providerResolutionAt: null,
    modelResolutionAt: null,
    aiCapabilityReadyAt: null,
  };

  while (Date.now() < deadline) {
    try {
      last = await health();
      const now = new Date().toISOString();
      const identityMatches = last.body?.identity?.buildSha === expectedSha
        && last.body?.identity?.releaseQualifiableIdentity === true;

      if (identityMatches) {
        if (!events.redisReadyAt && last.body?.dependencies?.durableRedis?.status === 'READY') {
          events.redisReadyAt = now;
        }
        if (!events.providerResolutionAt && last.body?.configuration?.status === 'RESOLVED') {
          events.providerResolutionAt = now;
        }
        if (!events.modelResolutionAt && resolvedModelsPresent(last.body)) {
          events.modelResolutionAt = now;
        }
        if (!events.aiCapabilityReadyAt && last.body?.dependencies?.localAI?.status === 'READY') {
          events.aiCapabilityReadyAt = now;
        }
        if (!events.trustedCoreReadyAt && last.body?.trustedCoreAvailable === true) {
          events.trustedCoreReadyAt = now;
        }
      }

      if (
        identityMatches
        && last.statusCode === 200
        && last.body?.status === 'READY'
      ) {
        return { health: last, events };
      }
    } catch {
      // Container may not be listening yet.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }
  throw new Error(`Docker stack did not reach identified READY state within ${timeoutMs}ms. Last state: ${JSON.stringify(last)}`);
}

function requiredModels() {
  return [...new Set([
    process.env.DOCKER_OLLAMA_MODEL?.trim() || DEFAULT_IMPORT_MODEL,
    process.env.DOCKER_OLLAMA_IMPORT_MODEL?.trim() || DEFAULT_IMPORT_MODEL,
    process.env.DOCKER_OLLAMA_OPTIMIZE_MODEL?.trim() || DEFAULT_OPTIMIZE_MODEL,
  ])];
}

function provisionModelsBeforeMeasurement() {
  const startedAt = new Date().toISOString();
  const models = requiredModels();
  let observedModels = '';

  try {
    // Provision/download/preload is deliberately outside measured attempts.
    // The following down retains volumes but clears all running containers/model memory.
    identifiedCompose('up', '-d', 'ollama');
    identifiedCompose('run', '--rm', 'ollama-init');
    observedModels = dockerCompose('exec', '-T', 'ollama', 'ollama', 'list');

    const missing = models.filter((model) => !observedModels.includes(model));
    if (missing.length > 0) {
      throw new Error(`Pre-measurement Ollama provisioning is missing required model(s): ${missing.join(', ')}`);
    }

    return {
      semantics: 'MODELS_PRESENT_IN_RETAINED_VOLUME_BEFORE_MEASUREMENT',
      measured: false,
      startedAt,
      completedAt: new Date().toISOString(),
      requiredModels: models,
      observedModels,
      volumesRetained: true,
      result: 'PASS',
    };
  } finally {
    try {
      dockerCompose('down');
    } catch {
      // Preserve the original provisioning error when cleanup also fails.
    }
  }
}

function elapsedMs(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : null;
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

  // A newly isolated reference Compose project may start with empty model volumes.
  // Provision models before the stopwatch so fresh-install/network download time
  // cannot masquerade as CONTAINERS_COLD_VOLUMES_RETAINED latency.
  const preMeasurementProvisioning = provisionModelsBeforeMeasurement();
  const provisioningRef = resolve(outputDir, 'pre-measurement-provisioning.json');
  await writeFile(provisioningRef, `${JSON.stringify(preMeasurementProvisioning, null, 2)}\n`, 'utf8');

  const attempts = [];
  let runtimeIdentityRef;
  let runtimeIdentity;
  try {
    for (let index = 1; index <= repetitions; index += 1) {
      dockerCompose('down');
      const orchestrationStartedAt = new Date().toISOString();
      const started = performance.now();
      identifiedCompose('up', '-d');
      const containerStartAt = serviceStartedAt('app');
      const readiness = await waitForReady(expectedSha, timeoutMs);
      const ready = readiness.health;
      const trustedCoreReadyAt = readiness.events.trustedCoreReadyAt;
      const readyAt = new Date().toISOString();
      const readyLatencyMs = Math.round(performance.now() - started);

      if (!runtimeIdentityRef) {
        const captured = await captureCanonicalRuntimeIdentity({
          baseUrl: BASE_URL,
          expectedBuildSha: expectedSha,
          healthStatusCode: ready.statusCode,
          healthBody: ready.body,
        });
        runtimeIdentityRef = captured.runtimeIdentityRef;
        runtimeIdentity = captured.runtimeIdentity;
      }

      const ps = dockerCompose('ps');
      const models = dockerCompose('exec', '-T', 'ollama', 'ollama', 'list');
      const attempt = {
        attempt: index,
        orchestrationStartedAt,
        containerStartAt,
        trustedCoreReadyAt,
        redisReadyAt: readiness.events.redisReadyAt,
        providerResolutionAt: readiness.events.providerResolutionAt,
        modelResolutionAt: readiness.events.modelResolutionAt,
        aiCapabilityReadyAt: readiness.events.aiCapabilityReadyAt,
        firstTrustedRequestAt: null,
        firstTrustedResponseAt: null,
        firstTrustedRequestState: 'UNKNOWN_NOT_EXERCISED_BY_COLD_START',
        readyAt,
        readyLatencyMs,
        observations: {
          containerToTrustedCoreReadyMs: elapsedMs(containerStartAt, trustedCoreReadyAt),
          containerToAiReadyMs: elapsedMs(containerStartAt, readiness.events.aiCapabilityReadyAt),
          containerToReadyMs: elapsedMs(containerStartAt, readyAt),
        },
        expectedBuildSha: expectedSha,
        runtimeIdentityRef,
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
    receiptVersion: 'ats-sys-02-cold-start-v0.1',
    semantics: 'CONTAINERS_COLD_VOLUMES_RETAINED',
    volumesRetained: true,
    destructiveVolumeReset: false,
    preMeasurementProvisioning,
    preMeasurementProvisioningRef: provisioningRef,
    expectedBuildSha: expectedSha,
    runtimeProfileId: process.env.CVENGINE_RUNTIME_PROFILE_ID,
    runtimeIdentityRef: runtimeIdentityRef || null,
    runtimeIdentity: runtimeIdentity || null,
    repetitions,
    attempts,
    result: attempts.length === repetitions
      && attempts.every((attempt) => attempt.result === 'PASS')
      && preMeasurementProvisioning.result === 'PASS'
      ? 'PASS'
      : 'FAIL',
    latencyBudgetApplied: false,
    unknowns: [
      'firstTrustedRequestAt',
      'firstTrustedResponseAt',
      'firstDeterministicResumeLatency',
      'firstInlineOptimizeLatency',
    ],
    note: 'Cold-start timing is observational only. Required model provisioning is explicitly performed before timing and excluded from measured attempts. Fresh-install/model-download cold start remains a separate uncharacterized scenario.',
  };
  await writeFile(resolve(outputDir, 'cold-start-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  process.stdout.write(`Runtime identity: ${receipt.runtimeIdentityRef}\n`);
  process.stdout.write(`Evidence: ${outputDir}\n`);
  if (receipt.result !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
