import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { captureCanonicalRuntimeIdentity } from './system-runtime-identity.mjs';

const BASE_URL = (process.env.CV_ENGINE_E2E_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const MANIFEST_PATH = resolve('tests/system/fixtures/canonical-personas.v0.1.json');
const FIXTURE_DIR = resolve('tests/system/fixtures/docx');

function isoSafe(value) {
  return value.replace(/[:.]/g, '-');
}

function dockerCompose(...args) {
  return execFileSync('docker', ['compose', ...args], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
}

async function timedRequest(url, init) {
  const started = performance.now();
  const response = await fetch(url, init);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return {
    statusCode: response.status,
    ok: response.ok,
    body,
    latencyMs: Math.round(performance.now() - started),
  };
}

async function getHealth() {
  return timedRequest(`${BASE_URL}/api/health`, { headers: { 'cache-control': 'no-cache' } });
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

function sameRuntimeIdentity(actual, expected) {
  return actual?.buildSha === expected?.buildSha
    && actual?.architectureVersion === expected?.architectureVersion
    && actual?.runtimeProfileId === expected?.runtimeProfileId
    && actual?.releaseQualifiableIdentity === true;
}

function assertExpectedHealth(observed, expected, scenarioId, baselineIdentity) {
  const problems = [];
  if (observed.statusCode !== expected.expectedHttpStatus) problems.push(`HTTP ${observed.statusCode} != ${expected.expectedHttpStatus}`);
  if (observed.body?.status !== expected.expectedHealth) problems.push(`status ${observed.body?.status} != ${expected.expectedHealth}`);
  if (observed.body?.trustedCoreAvailable !== expected.trustedCoreAvailable) {
    problems.push(`trustedCoreAvailable ${observed.body?.trustedCoreAvailable} != ${expected.trustedCoreAvailable}`);
  }
  if (!sameRuntimeIdentity(observed.body?.identity, baselineIdentity)) {
    problems.push('runtime identity changed during fault observation');
  }

  const degraded = observed.body?.degradedCapabilities ?? [];
  const unavailable = observed.body?.unavailableCapabilities ?? [];
  if (scenarioId === 'local-ai-down') {
    if (!degraded.includes('resume-import-ai') || !degraded.includes('inline-optimize')) {
      problems.push('local AI outage did not mark AI-assisted capabilities degraded');
    }
    if (unavailable.length > 0) problems.push(`local AI outage unexpectedly marked unavailable capabilities: ${unavailable.join(', ')}`);
  }
  if (scenarioId === 'durable-redis-down') {
    if (!unavailable.includes('durable-state')) {
      problems.push('Redis outage did not mark durable-state unavailable');
    }
  }

  if (problems.length) throw new Error(`${scenarioId}: ${problems.join(' | ')}`);
}

function faultCapability(scenarioId) {
  if (scenarioId === 'local-ai-down') return 'bounded-local-ai';
  if (scenarioId === 'durable-redis-down') return 'trusted-durable-persistence';
  return 'UNKNOWN';
}

async function probeLocalAiFailure(persona, outputDir) {
  const fileName = persona?.sourceDocument?.fileName;
  if (!fileName) throw new Error('P10 local-AI probe requires a canonical source document.');
  const bytes = await readFile(resolve(FIXTURE_DIR, fileName));
  const form = new FormData();
  form.append(
    'file',
    new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    fileName,
  );

  const result = await timedRequest(`${BASE_URL}/api/import-resume`, { method: 'POST', body: form });
  const evidenceRef = await persist(resolve(outputDir, 'local-ai-down-capability-probe.json'), result);
  const safeFailure = result.ok === false
    && result.body?.success === false
    && result.body?.data === undefined
    && ['AI_EXTRACTION', 'RUNTIME'].includes(result.body?.stage)
    && [502, 503, 504].includes(result.statusCode);
  if (!safeFailure) {
    throw new Error(`local-ai-down: resume import did not fail safely at the AI boundary. HTTP ${result.statusCode} stage ${result.body?.stage ?? 'UNKNOWN'}.`);
  }

  return {
    capability: 'resume-import-ai',
    expectedBehavior: 'SAFE_FAILURE_NO_CANDIDATE_TRUTH_ACCEPTED',
    observedBehavior: {
      httpStatus: result.statusCode,
      success: result.body?.success,
      stage: result.body?.stage,
      errorCode: result.body?.errorCode,
      providerKind: result.body?.provider?.kind,
      responseLatencyMs: result.latencyMs,
    },
    candidateTruthAccepted: false,
    evidenceRef,
    result: 'PASS',
  };
}

function durableAssessmentProbeBody() {
  return {
    personalInfo: {
      fullName: 'P10 DURABILITY PROBE',
      location: 'Lima, Peru',
      email: 'p10-durability@example.test',
    },
    summary: 'Backend developer using Python and SQL for API and data workflows.',
    experience: [],
    education: [],
    skills: {
      hardSkills: ['Python', 'SQL'],
      softSkills: [],
    },
    projects: [],
    certifications: [],
    languages: [],
    jobDescription: 'Backend Developer required to build Python APIs and work with SQL relational data systems.',
    careerVaultId: randomUUID(),
    careerTarget: {
      roleTitle: 'Backend Developer',
      jobFamily: 'Software Engineering',
      preferredSeniority: 'MID',
      preferredLocations: [],
      workModels: ['REMOTE'],
      employmentTypes: ['FULL_TIME'],
      industries: ['Software'],
      relocation: 'UNSPECIFIED',
      priority: 3,
    },
  };
}

async function probeDurableFailure(outputDir) {
  const result = await timedRequest(`${BASE_URL}/api/assess-opportunity`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(durableAssessmentProbeBody()),
  });
  const evidenceRef = await persist(resolve(outputDir, 'durable-redis-down-capability-probe.json'), result);
  const refusedTrustedSuccess = result.statusCode === 503
    && result.body?.success === false
    && result.body?.data === undefined
    && result.body?.persistence?.status === 'UNAVAILABLE'
    && result.body?.persistence?.stage === 'PREFLIGHT';
  if (!refusedTrustedSuccess) {
    throw new Error(`durable-redis-down: trusted durable assessment was not refused at persistence preflight. HTTP ${result.statusCode}.`);
  }

  return {
    capability: 'opportunity-assessment-durability',
    expectedBehavior: 'FAIL_CLOSED_BEFORE_TRUSTED_DURABLE_SUCCESS',
    observedBehavior: {
      httpStatus: result.statusCode,
      success: result.body?.success,
      persistenceStatus: result.body?.persistence?.status,
      persistenceStage: result.body?.persistence?.stage,
      persistenceReason: result.body?.persistence?.reason,
      responseLatencyMs: result.latencyMs,
    },
    trustedDurableSuccessEmitted: false,
    evidenceRef,
    result: 'PASS',
  };
}

async function probeFaultBehavior(scenarioId, manifest, outputDir) {
  if (scenarioId === 'local-ai-down') {
    return probeLocalAiFailure(manifest.personas?.P01, outputDir);
  }
  if (scenarioId === 'durable-redis-down') {
    return probeDurableFailure(outputDir);
  }
  throw new Error(`Unsupported fault behavior probe ${scenarioId}.`);
}

async function waitForFullRecovery(baselineIdentity) {
  return waitFor(async () => {
    const health = await getHealth();
    const recovered = health.statusCode === 200
      && health.body?.status === 'READY'
      && health.body?.trustedCoreAvailable === true
      && health.body?.dependencies?.localAI?.status === 'READY'
      && health.body?.dependencies?.durableRedis?.status === 'READY'
      && sameRuntimeIdentity(health.body?.identity, baselineIdentity);
    return recovered ? health : false;
  }, 90000);
}

async function runScenario(scenario, manifest, baselineIdentity, runtimeIdentityRef, outputDir) {
  const service = scenario.id === 'local-ai-down' ? 'ollama' : scenario.id === 'durable-redis-down' ? 'redis' : null;
  if (!service) throw new Error(`Unsupported fault scenario ${scenario.id}`);

  const startedAt = new Date().toISOString();
  const started = performance.now();
  let observed;
  let recovery;
  let capabilityProbe;
  let faultDetectionLatencyMs;
  try {
    dockerCompose('stop', service);
    observed = await waitFor(async () => {
      const health = await getHealth();
      const matches = health.statusCode === scenario.expectedHttpStatus && health.body?.status === scenario.expectedHealth;
      return matches ? health : false;
    }, 45000);
    assertExpectedHealth(observed, scenario, scenario.id, baselineIdentity);
    faultDetectionLatencyMs = Math.round(performance.now() - started);
    capabilityProbe = await probeFaultBehavior(scenario.id, manifest, outputDir);
  } finally {
    dockerCompose('start', service);
    recovery = await waitForFullRecovery(baselineIdentity);
  }

  const receipt = {
    receiptVersion: 'ats-sys-02-fault-receipt-v0.2',
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
    capabilityProbe,
    httpStatus: observed.statusCode,
    trustedCoreAvailable: observed.body.trustedCoreAvailable,
    degradedCapabilities: observed.body.degradedCapabilities ?? [],
    unavailableCapabilities: observed.body.unavailableCapabilities ?? [],
    recoveryObserved: {
      restored: recovery.body?.status === 'READY'
        && recovery.body?.trustedCoreAvailable === true
        && sameRuntimeIdentity(recovery.body?.identity, baselineIdentity),
      status: recovery.body?.status ?? 'UNKNOWN',
      httpStatus: recovery.statusCode,
      trustedCoreAvailable: recovery.body?.trustedCoreAvailable,
      dependencies: recovery.body?.dependencies,
      identity: recovery.body?.identity,
      observedAt: new Date().toISOString(),
    },
    measurements: {
      faultDetectionLatencyMs,
      capabilityProbeLatencyMs: capabilityProbe?.observedBehavior?.responseLatencyMs,
      detectionAndRecoveryLatencyMs: Math.round(performance.now() - started),
      finalRecoveryProbeLatencyMs: recovery.latencyMs,
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
  const baselineIdentity = initial.body.identity;

  const expectedBuildSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (baselineIdentity.buildSha !== expectedBuildSha) {
    throw new Error(`VERSION_SKEW: runtime ${baselineIdentity.buildSha} != expected ${expectedBuildSha}`);
  }
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
    const receipt = await runScenario(scenario, manifest, baselineIdentity, runtimeIdentityRef, outputDir);
    receipts.push(receipt);
    process.stdout.write(`${scenario.id}: PASS\n`);
  }
  await persist(resolve(outputDir, 'summary.json'), {
    personaId: 'P10',
    runtimeIdentityRef,
    baselineIdentity,
    receipts,
  });
  process.stdout.write(`Runtime identity: ${runtimeIdentityRef}\n`);
  process.stdout.write(`Evidence: ${outputDir}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
