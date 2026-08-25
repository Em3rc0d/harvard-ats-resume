import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { captureCanonicalRuntimeIdentity } from './system-runtime-identity.mjs';

const BASE_URL = (process.env.CV_ENGINE_E2E_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const MANIFEST_PATH = resolve('tests/system/fixtures/canonical-personas.v0.1.json');
const FIXTURE_DIR = resolve('tests/system/fixtures/docx');
const MODEL_FORCED_PERSONA = 'P01';
const DEFAULT_LEVELS = [1, 2, 4, 8];
const DEFAULT_SATURATION_CONCURRENCY = 16;
const RECEIPT_VERSION = 'ats-sys-03d-model-forced-capacity-v0.1';
const SAFE_FAILURE_CODES = new Set([
  'RESUME_IMPORT_TIMEOUT',
  'RESUME_EXTRACTION_INCOMPLETE',
  'NO_SOURCE_BACKED_CANDIDATE_CONTENT',
  'NO_CANDIDATE_CONTENT',
  'SOURCE_RECONCILIATION_REJECTED',
  'RESUME_IMPORT_RUNTIME_FAILURE',
  'AI_PROVIDER_TIMEOUT',
  'AI_PROVIDER_UNAVAILABLE',
  'AI_PROVIDER_CONNECTION_FAILURE',
  'AI_PROVIDER_INVALID_PROVIDER_RESPONSE',
]);

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isoSafe(value) {
  return value.replace(/[:.]/g, '-');
}

function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase();
}

function hasString(haystack, needle) {
  return normalize(haystack).includes(normalize(needle));
}

function percentile(values, percentileValue) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function parseLevels(value) {
  if (!value) return DEFAULT_LEVELS;
  const parsed = value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
  if (parsed.length === 0) throw new Error('--levels must contain positive integers, for example 1,2,4,8.');
  return [...new Set(parsed)];
}

function validateImportedTruth(candidate, expected) {
  const issues = [];
  const serialized = JSON.stringify(candidate);
  const summaryPresent = Boolean(candidate?.summary?.trim?.());
  if (summaryPresent !== expected.summaryPresent) {
    issues.push(`summary expected ${expected.summaryPresent}, received ${summaryPresent}`);
  }
  const experienceCount = Array.isArray(candidate?.experience) ? candidate.experience.length : 0;
  if (experienceCount !== expected.experienceCount) {
    issues.push(`experience expected ${expected.experienceCount}, received ${experienceCount}`);
  }
  const educationCount = Array.isArray(candidate?.education) ? candidate.education.length : 0;
  if (educationCount !== expected.educationCount) {
    issues.push(`education expected ${expected.educationCount}, received ${educationCount}`);
  }
  for (const required of expected.requiredStrings) {
    if (!hasString(serialized, required)) issues.push(`missing required truth: ${required}`);
  }
  for (const forbidden of expected.forbiddenStrings) {
    if (hasString(serialized, forbidden)) issues.push(`forbidden candidate truth present: ${forbidden}`);
  }
  return issues;
}

function ollamaChatCount() {
  const result = execFileSync(
    'docker',
    ['compose', 'logs', '--no-color', 'ollama'],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );
  return result
    .split(/\r?\n/)
    .filter((line) => /\bPOST\b.*\/api\/chat\b/.test(line))
    .length;
}

async function persist(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path;
}

async function health(expectedBuildSha) {
  const response = await fetch(`${BASE_URL}/api/health`);
  const body = await response.json();
  if (response.status !== 200 || body?.status !== 'READY') {
    throw new Error(`ATS-SYS-03D requires READY runtime; received HTTP ${response.status} / ${body?.status ?? 'UNKNOWN'}.`);
  }
  const identity = body?.identity;
  if (!identity?.releaseQualifiableIdentity || identity?.buildSha !== expectedBuildSha) {
    throw new Error(`Runtime identity mismatch: expected ${expectedBuildSha}, received ${identity?.buildSha ?? 'UNKNOWN'}.`);
  }
  return { body, identity };
}

async function importFixture(persona, requestId) {
  const fixturePath = resolve(FIXTURE_DIR, persona.sourceDocument.fileName);
  const bytes = await readFile(fixturePath);
  const form = new FormData();
  form.append(
    'file',
    new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    basename(fixturePath),
  );

  const started = performance.now();
  let response;
  let body;
  try {
    response = await fetch(`${BASE_URL}/api/import-resume`, {
      method: 'POST',
      body: form,
      headers: { 'x-ats-sys-03d-request-id': requestId },
    });
    const text = await response.text();
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
  } catch (error) {
    return {
      requestId,
      personaId: MODEL_FORCED_PERSONA,
      fixtureRef: fixturePath,
      latencyMs: Math.round(performance.now() - started),
      classification: 'SAFE_TRANSPORT_FAILURE',
      httpStatus: null,
      errorCode: 'FETCH_FAILURE',
      section: null,
      truthIssues: [],
      acceptedCandidateTruth: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const latencyMs = Math.round(performance.now() - started);
  if (response.ok && body?.success && body?.data?.resume) {
    const truthIssues = validateImportedTruth(body.data.resume, persona.expectedTruth);
    return {
      requestId,
      personaId: MODEL_FORCED_PERSONA,
      fixtureRef: fixturePath,
      latencyMs,
      classification: truthIssues.length === 0 ? 'SUCCESS_TRUTH_SAFE' : 'UNSAFE_SUCCESS',
      httpStatus: response.status,
      errorCode: null,
      section: null,
      truthIssues,
      acceptedCandidateTruth: true,
      importer: body.data.context?.receipt?.importer,
      importerVersion: body.data.context?.receipt?.importerVersion,
      rejectedFieldPaths: body.data.context?.rejectedFieldPaths ?? [],
    };
  }

  const hasAcceptedData = Boolean(body?.data?.resume || body?.data?.context);
  const errorCode = typeof body?.errorCode === 'string' ? body.errorCode : `HTTP_${response.status}`;
  let classification;
  if (hasAcceptedData) classification = 'UNSAFE_FAILURE_WITH_ACCEPTED_DATA';
  else if (errorCode === 'RESUME_IMPORT_RATE_LIMITED') classification = 'CONTROL_PLANE_RATE_LIMIT';
  else if (SAFE_FAILURE_CODES.has(errorCode) || errorCode.startsWith('AI_PROVIDER_')) classification = 'SAFE_FAILURE';
  else classification = 'SAFE_REJECTED_OTHER';

  return {
    requestId,
    personaId: MODEL_FORCED_PERSONA,
    fixtureRef: fixturePath,
    latencyMs,
    classification,
    httpStatus: response.status,
    errorCode,
    section: body?.section ?? null,
    truthIssues: [],
    acceptedCandidateTruth: hasAcceptedData,
    detail: body?.error ?? null,
  };
}

function summarizeRequests(requests) {
  const latencies = requests.map((item) => item.latencyMs).filter(Number.isFinite);
  const counts = {};
  for (const request of requests) counts[request.classification] = (counts[request.classification] ?? 0) + 1;
  return {
    requests: requests.length,
    counts,
    successTruthSafe: counts.SUCCESS_TRUTH_SAFE ?? 0,
    safeFailures: (counts.SAFE_FAILURE ?? 0) + (counts.SAFE_TRANSPORT_FAILURE ?? 0) + (counts.SAFE_REJECTED_OTHER ?? 0),
    unsafeAcceptedTruth: (counts.UNSAFE_SUCCESS ?? 0) + (counts.UNSAFE_FAILURE_WITH_ACCEPTED_DATA ?? 0),
    rateLimited: counts.CONTROL_PLANE_RATE_LIMIT ?? 0,
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies.length ? Math.max(...latencies) : null,
      min: latencies.length ? Math.min(...latencies) : null,
    },
  };
}

async function runModelForcedWave({ concurrency, persona, waveId }) {
  const startedAt = new Date().toISOString();
  const chatCountBefore = ollamaChatCount();
  const wallStarted = performance.now();
  const requests = await Promise.all(
    Array.from({ length: concurrency }, (_, index) =>
      importFixture(persona, `${waveId}-${index + 1}`)),
  );
  const wallLatencyMs = Math.round(performance.now() - wallStarted);
  const chatCountAfter = ollamaChatCount();
  const ollamaChatCalls = chatCountAfter - chatCountBefore;
  return {
    waveId,
    concurrency,
    startedAt,
    completedAt: new Date().toISOString(),
    wallLatencyMs,
    summary: summarizeRequests(requests),
    modelTrace: {
      source: 'docker compose logs ollama',
      endpoint: '/api/chat',
      before: chatCountBefore,
      after: chatCountAfter,
      ollamaChatCalls,
      expectedChatCalls: concurrency,
      result: ollamaChatCalls === concurrency ? 'PASS' : 'FAIL',
    },
    requests,
  };
}

function assertAdmissibleWave(wave, phase) {
  if (wave.summary.unsafeAcceptedTruth > 0) {
    throw new Error(`${phase} unsafe accepted truth at concurrency ${wave.concurrency}.`);
  }
  if (wave.summary.rateLimited > 0) {
    throw new Error(`${phase} confounded by API rate limiting at concurrency ${wave.concurrency}.`);
  }
  if (wave.modelTrace.result !== 'PASS') {
    throw new Error(
      `${phase} model trace mismatch at concurrency ${wave.concurrency}: expected ${wave.modelTrace.expectedChatCalls} Ollama /api/chat calls, observed ${wave.modelTrace.ollamaChatCalls}.`,
    );
  }
}

async function main() {
  const expectedBuildSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const persona = manifest.personas?.[MODEL_FORCED_PERSONA];
  if (!persona?.sourceDocument || !persona?.expectedTruth) {
    throw new Error(`Missing truth-known model-forced fixture for ${MODEL_FORCED_PERSONA}.`);
  }

  const levels = parseLevels(argValue('--levels'));
  const saturationConcurrency = Number(argValue('--saturation-concurrency') || DEFAULT_SATURATION_CONCURRENCY);
  if (!Number.isInteger(saturationConcurrency) || saturationConcurrency < 1) {
    throw new Error('--saturation-concurrency must be a positive integer.');
  }

  const startedAt = new Date().toISOString();
  const outputDir = resolve(
    process.env.CVENGINE_SYS03D_EVIDENCE_DIR
      || `evidence/ats-sys-03/model-forced-capacity/${isoSafe(startedAt)}`,
  );
  await mkdir(outputDir, { recursive: true });

  const initialHealth = await health(expectedBuildSha);
  const runtimeIdentity = await captureCanonicalRuntimeIdentity({
    expectedBuildSha,
    healthStatusCode: 200,
    healthBody: initialHealth.body,
  });

  const capacityWaves = [];
  for (const concurrency of levels) {
    const wave = await runModelForcedWave({
      concurrency,
      persona,
      waveId: `model-capacity-c${concurrency}`,
    });
    assertAdmissibleWave(wave, 'ATS-SYS-03D');
    capacityWaves.push(wave);
    process.stdout.write(
      `ATS-SYS-03D c${concurrency}: success=${wave.summary.successTruthSafe}/${wave.summary.requests}, safeFailure=${wave.summary.safeFailures}, ollamaChat=${wave.modelTrace.ollamaChatCalls}/${wave.modelTrace.expectedChatCalls}, p95=${wave.summary.latencyMs.p95} ms\n`,
    );
  }
  await persist(resolve(outputDir, '01-model-capacity-waves.json'), capacityWaves);

  const saturation = await runModelForcedWave({
    concurrency: saturationConcurrency,
    persona,
    waveId: `model-saturation-c${saturationConcurrency}`,
  });
  assertAdmissibleWave(saturation, 'ATS-SYS-03D saturation');
  await persist(resolve(outputDir, '02-model-saturation.json'), saturation);
  process.stdout.write(
    `ATS-SYS-03D saturation c${saturationConcurrency}: success=${saturation.summary.successTruthSafe}/${saturation.summary.requests}, safeFailure=${saturation.summary.safeFailures}, ollamaChat=${saturation.modelTrace.ollamaChatCalls}/${saturation.modelTrace.expectedChatCalls}, p95=${saturation.summary.latencyMs.p95} ms\n`,
  );

  const recoveryHealth = await health(expectedBuildSha);
  const recoveryWave = await runModelForcedWave({
    concurrency: 1,
    persona,
    waveId: 'model-recovery-c1',
  });
  assertAdmissibleWave(recoveryWave, 'ATS-SYS-03D recovery');
  const recoveryRequest = recoveryWave.requests[0];
  const recovery = {
    healthStatus: recoveryHealth.body.status,
    request: recoveryRequest,
    modelTrace: recoveryWave.modelTrace,
    result: recoveryRequest.classification === 'SUCCESS_TRUTH_SAFE' && recoveryWave.modelTrace.result === 'PASS'
      ? 'PASS'
      : 'FAIL',
  };
  await persist(resolve(outputDir, '03-model-recovery.json'), recovery);
  if (recovery.result !== 'PASS') {
    throw new Error(`ATS-SYS-03D recovery failed: ${recoveryRequest.classification}.`);
  }

  const allRequests = [
    ...capacityWaves.flatMap((wave) => wave.requests),
    ...saturation.requests,
    recoveryRequest,
  ];
  const aggregate = summarizeRequests(allRequests);
  const totalOllamaChatCalls = capacityWaves.reduce((sum, wave) => sum + wave.modelTrace.ollamaChatCalls, 0)
    + saturation.modelTrace.ollamaChatCalls
    + recovery.modelTrace.ollamaChatCalls;
  const expectedOllamaChatCalls = allRequests.length;
  const maxZeroFailureConcurrency = capacityWaves
    .filter((wave) =>
      wave.summary.successTruthSafe === wave.summary.requests
      && wave.summary.unsafeAcceptedTruth === 0
      && wave.modelTrace.result === 'PASS')
    .reduce((max, wave) => Math.max(max, wave.concurrency), 0);

  const receipt = {
    receiptVersion: RECEIPT_VERSION,
    startedAt,
    completedAt: new Date().toISOString(),
    expectedBuildSha,
    runtimeProfileId: process.env.CVENGINE_RUNTIME_PROFILE_ID ?? 'UNDECLARED',
    runtimeIdentityRef: runtimeIdentity.runtimeIdentityRef,
    runtimeFingerprint: runtimeIdentity.runtimeIdentity,
    baseUrl: BASE_URL,
    fixture: {
      personaId: MODEL_FORCED_PERSONA,
      manifestRef: MANIFEST_PATH,
      fixtureRef: resolve(FIXTURE_DIR, persona.sourceDocument.fileName),
      format: 'DOCX',
      truthKnown: true,
      modelForcedContract: 'P01 generic SKILLS is regression-locked to bypass the TECHNICAL SKILLS source-exact fast path and invoke bounded resume-import-ai.',
      expectedOllamaChatCallsPerImport: 1,
    },
    capacity: {
      levels,
      waves: capacityWaves.map(({ requests: _requests, ...wave }) => wave),
      maxZeroFailureConcurrency,
      result: capacityWaves.every((wave) => wave.modelTrace.result === 'PASS' && wave.summary.unsafeAcceptedTruth === 0)
        ? 'OBSERVED_MODEL_BACKED_SAFE'
        : 'BLOCKED',
    },
    saturation: {
      concurrency: saturationConcurrency,
      summary: saturation.summary,
      wallLatencyMs: saturation.wallLatencyMs,
      modelTrace: saturation.modelTrace,
      result: saturation.modelTrace.result === 'PASS' && saturation.summary.unsafeAcceptedTruth === 0
        ? 'OBSERVED_MODEL_BACKED_SAFE'
        : 'BLOCKED',
    },
    recovery,
    aggregate: {
      ...aggregate,
      ollamaChatCalls: totalOllamaChatCalls,
      expectedOllamaChatCalls,
      modelTraceComplete: totalOllamaChatCalls === expectedOllamaChatCalls,
    },
    totalRequests: allRequests.length,
    result: aggregate.unsafeAcceptedTruth === 0
      && aggregate.rateLimited === 0
      && totalOllamaChatCalls === expectedOllamaChatCalls
      && recovery.result === 'PASS'
      ? 'EVIDENCE_CAPTURED'
      : 'FAILED',
    policy: [
      'ATS-SYS-03D characterizes one model-backed import shape only: P01 with generic SKILLS requiring one qwen3:1.7b /api/chat call per import.',
      'Observed model-backed concurrency is not a production SLA until repeated runs and explicit capacity budgets are approved.',
      'A successful endpoint response without the expected Ollama /api/chat trace invalidates the model-forced capacity claim.',
      'Any accepted candidate truth outside the authored P01 truth envelope is a hard failure.',
      'This does not characterize resumes that require multiple AI-backed sections per document.',
    ],
  };
  await persist(resolve(outputDir, 'receipt.json'), receipt);

  process.stdout.write(`Recovery: ${recovery.result}\n`);
  process.stdout.write(`Max zero-failure model-backed observed concurrency: ${maxZeroFailureConcurrency}\n`);
  process.stdout.write(`Ollama /api/chat calls: ${totalOllamaChatCalls}/${expectedOllamaChatCalls}\n`);
  process.stdout.write(`Unsafe accepted truth: ${aggregate.unsafeAcceptedTruth}\n`);
  process.stdout.write(`Evidence: ${outputDir}\n`);

  if (receipt.result !== 'EVIDENCE_CAPTURED') process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
