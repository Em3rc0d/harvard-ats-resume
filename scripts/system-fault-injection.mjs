import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { captureCanonicalRuntimeIdentity } from './system-runtime-identity.mjs';

const BASE_URL = (process.env.CV_ENGINE_E2E_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const MANIFEST_PATH = resolve('tests/system/fixtures/canonical-personas.v0.1.json');

function isoSafe(value) {
  return value.replace(/[:.]/g, '-');
}

function dockerCompose(...args) {
  return execFileSync('docker', ['compose', ...args], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
}

async function getHealth() {
  const started = performance.now();
  const response = await fetch(`${BASE_URL}/api/health`, { headers: { 'cache-control': 'no-cache' } });
  const body = await response.json();
  return { statusCode: response.status, body, latencyMs: Math.round(performance.now() - started) };
}

async function waitFor(predicate, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }
  throw lastError || new Error(`Condition not reached within ${timeoutMs}ms.`);
}

async function persist(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path;
}

function assertExpectedHealth(observed, expected, scenarioId) {
  const problems = [];
  if (observed.statusCode !== expected.expectedHttpStatus) problems.push(`HTTP ${observed.statusCode} != ${expected.expectedHttpStatus}`);
  if (observed.body?.status !== expected.expectedHealth) problems.push(`status ${observed.body?.status} != ${expected.expectedHealth}`);
  if (observed.body?.trustedCoreAvailable !== expected.trustedCoreAvailable) {
    problems.push(`trustedCoreAvailable ${observed.body?.trustedCoreAvailable} != ${expected.trustedCoreAvailable}`);
  }
  if (problems.length) throw new Error(`${scenarioId}: ${problems.join(' | ')}`);
}

function faultCapability(scenarioId) {
  if (scenarioId === 'local-ai-down') return 'bounded-local-ai';
  if (scenarioId === 'durable-redis-down') return 'trusted-durable-persistence';
  return 'UNKNOWN';
}

async function runScenario(scenario, runtimeIdentityRef, outputDir) {
  const service = scenario.id === 'local-ai-down' ? 'ollama' : scenario.id === 'durable-redis-down' ? 'redis' : null;
  if (!service) throw new Error(`Unsupported fault scenario ${scenario.id}`);

  const startedAt = new Date().toISOString();
  const started = performance.now();
  let observed;
  let recovery;
  try {
    dockerCompose('stop', service);
    observed = await waitFor(async () => {
      const health = await getHealth();
      const matches = health.statusCode === scenario.expectedHttpStatus && health.body?.status === scenario.expectedHealth;
      return matches ? health : false;
    }, 45000);
    assertExpectedHealth(observed, scenario, scenario.id);
  } finally {
    dockerCompose('start', service);
    recovery = await waitFor(async () => {
      const health = await getHealth();
      if (service === 'ollama') return health.body?.dependencies?.localAI?.status === 'READY' ? health : false;
      return health.body?.dependencies?.durableRedis?.status === 'READY' ? health : false;
    }, 90000);
  }

  const receipt = {
    receiptVersion: 'ats-sys-02-fault-receipt-v0.1',
    personaId: 'P10',
    faultId: scenario.id,
    scenarioId: scenario.id,
    runtimeIdentityRef,
    capability: faultCapability(scenario.id),
    failureClass: scenario.failureClass,
    injectionMethod: `docker compose stop ${service}`,
    startedAt,
    completedAt: new Date().toISOString(),
    expectedState: {
      status: scenario.expectedHealth,
      httpStatus: scenario.expectedHttpStatus,
      trustedCoreAvailable: scenario.trustedCoreAvailable,
    },
    observedState: {
      status: observed.body.status,
      httpStatus: observed.statusCode,
      trustedCoreAvailable: observed.body.trustedCoreAvailable,
      degradedCapabilities: observed.body.degradedCapabilities ?? [],
      unavailableCapabilities: observed.body.unavailableCapabilities ?? [],
      dependencies: observed.body.dependencies,
      identity: observed.body.identity,
    },
    httpStatus: observed.statusCode,
    trustedCoreAvailable: observed.body.trustedCoreAvailable,
    degradedCapabilities: observed.body.degradedCapabilities ?? [],
    unavailableCapabilities: observed.body.unavailableCapabilities ?? [],
    recoveryObserved: {
      restored: true,
      status: recovery.body?.status ?? 'UNKNOWN',
      httpStatus: recovery.statusCode,
      dependencies: recovery.body?.dependencies,
      observedAt: new Date().toISOString(),
    },
    measurements: {
      detectionAndRecoveryLatencyMs: Math.round(performance.now() - started),
      faultDetectionLatencyMs: observed.latencyMs,
    },
    result: 'PASS',
  };
  await persist(resolve(outputDir, `${scenario.id}.json`), receipt);
  return receipt;
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const p10 = manifest.personas?.P10;
  if (!p10 || p10.status !== 'REQUIRED' || !Array.isArray(p10.faultScenarios)) {
    throw new Error('P10 fault contract is missing from canonical persona manifest.');
  }

  const initial = await getHealth();
  if (initial.statusCode !== 200 || initial.body?.status !== 'READY') {
    throw new Error(`Fault injection requires a fully READY baseline; received HTTP ${initial.statusCode} ${initial.body?.status}.`);
  }
  if (!initial.body?.identity?.releaseQualifiableIdentity) {
    throw new Error('Fault injection requires identified build and declared runtime profile.');
  }

  const expectedBuildSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const capturedIdentity = await captureCanonicalRuntimeIdentity({
    expectedBuildSha,
    healthStatusCode: initial.statusCode,
    healthBody: initial.body,
  });
  const runtimeIdentityRef = capturedIdentity.runtimeIdentityRef;

  const outputDir = resolve(process.env.CVENGINE_SYSTEM_EVIDENCE_DIR || `evidence/ats-sys-02/faults/${isoSafe(new Date().toISOString())}`);
  await mkdir(outputDir, { recursive: true });
  await persist(resolve(outputDir, '00-baseline-health.json'), initial);
  await persist(resolve(outputDir, '00-runtime-identity-ref.json'), {
    runtimeIdentityRef,
    buildSha: capturedIdentity.runtimeIdentity.buildSha,
    runtimeProfile: capturedIdentity.runtimeIdentity.runtimeProfile,
  });

  const receipts = [];
  for (const scenario of p10.faultScenarios) {
    process.stdout.write(`Injecting ${scenario.id}...\n`);
    const receipt = await runScenario(scenario, runtimeIdentityRef, outputDir);
    receipts.push(receipt);
    process.stdout.write(`${scenario.id}: PASS\n`);
  }
  await persist(resolve(outputDir, 'summary.json'), {
    personaId: 'P10',
    runtimeIdentityRef,
    receipts,
  });
  process.stdout.write(`Runtime identity: ${runtimeIdentityRef}\n`);
  process.stdout.write(`Evidence: ${outputDir}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});