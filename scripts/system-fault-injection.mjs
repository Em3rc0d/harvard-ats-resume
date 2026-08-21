import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

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

async function runScenario(scenario, outputDir) {
  const service = scenario.id === 'local-ai-down' ? 'ollama' : scenario.id === 'durable-redis-down' ? 'redis' : null;
  if (!service) throw new Error(`Unsupported fault scenario ${scenario.id}`);

  const startedAt = new Date().toISOString();
  const started = performance.now();
  let observed;
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
    await waitFor(async () => {
      const health = await getHealth();
      if (service === 'ollama') return health.body?.dependencies?.localAI?.status === 'READY' ? health : false;
      return health.body?.dependencies?.durableRedis?.status === 'READY' ? health : false;
    }, 90000);
  }

  const receipt = {
    receiptVersion: 'ats-sys-01-fault-receipt-v0.1',
    personaId: 'P10',
    scenarioId: scenario.id,
    failureClass: scenario.failureClass,
    startedAt,
    completedAt: new Date().toISOString(),
    expected: {
      status: scenario.expectedHealth,
      httpStatus: scenario.expectedHttpStatus,
      trustedCoreAvailable: scenario.trustedCoreAvailable,
    },
    observed: {
      status: observed.body.status,
      httpStatus: observed.statusCode,
      trustedCoreAvailable: observed.body.trustedCoreAvailable,
      degradedCapabilities: observed.body.degradedCapabilities,
      dependencies: observed.body.dependencies,
      identity: observed.body.identity,
    },
    measurements: { detectionLatencyMs: Math.round(performance.now() - started) },
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

  const outputDir = resolve(process.env.CVENGINE_SYSTEM_EVIDENCE_DIR || `evidence/system/faults/${isoSafe(new Date().toISOString())}`);
  await mkdir(outputDir, { recursive: true });
  await persist(resolve(outputDir, '00-baseline-health.json'), initial);

  const receipts = [];
  for (const scenario of p10.faultScenarios) {
    process.stdout.write(`Injecting ${scenario.id}...\n`);
    const receipt = await runScenario(scenario, outputDir);
    receipts.push(receipt);
    process.stdout.write(`${scenario.id}: PASS\n`);
  }
  await persist(resolve(outputDir, 'summary.json'), { personaId: 'P10', receipts });
  process.stdout.write(`Evidence: ${outputDir}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
