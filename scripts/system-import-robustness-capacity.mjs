import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { captureCanonicalRuntimeIdentity } from './system-runtime-identity.mjs';

const BASE_URL = (process.env.CV_ENGINE_E2E_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const MANIFEST_PATH = resolve('tests/system/fixtures/canonical-personas.v0.1.json');
const FIXTURE_DIR = resolve('tests/system/fixtures/docx');
const REQUIRED_PERSONAS = ['P01', 'P03', 'P04', 'P09'];
const DEFAULT_LEVELS = [1, 2, 4, 8];
const DEFAULT_SATURATION_CONCURRENCY = 16;
const RECEIPT_VERSION = 'ats-sys-03-import-capacity-v0.1';
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
  const parsed = value.split(',').map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item > 0);
  if (parsed.length === 0) throw new Error('--levels must contain positive integers, for example 1,2,4,8.');
  return [...new Set(parsed)];
}

function validateImportedTruth(candidate, expected) {
  const issues = [];
  const serialized = JSON.stringify(candidate);
  const summaryPresent = Boolean(candidate?.summary?.trim?.());
  if (summaryPresent !== expected.summaryPresent) issues.push(`summary expected ${expected.summaryPresent}, received ${summaryPresent}`);
  const experienceCount = Array.isArray(candidate?.experience) ? candidate.experience.length : 0;
  if (experienceCount !== expected.experienceCount) issues.push(`experience expected ${expected.experienceCount}, received ${experienceCount}`);
  const educationCount = Array.isArray(candidate?.education) ? candidate.education.length : 0;
  if (educationCount !== expected.educationCount) issues.push(`education expected ${expected.educationCount}, received ${educationCount}`);
  for (const required of expected.requiredStrings) {
    if (!hasString(serialized, required)) issues.push(`missing required truth: ${required}`);
  }
  for (const forbidden of expected.forbiddenStrings) {
    if (hasString(serialized, forbidden)) issues.push(`forbidden candidate truth present: ${forbidden}`);
  }
  return issues;
}

async function persist(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path;
}

async function health(expectedBuildSha) {
  const response = await fetch(`${BASE_URL}/api/health`);
  const body = await response.json();
  if (response.status !== 200 || body?.status !== 'READY') {
    throw new Error(`ATS-SYS-03 requires READY runtime; received HTTP ${response.status} / ${body?.status ?? 'UNKNOWN'}.`);
  }
  const identity = body?.identity;
  if (!identity?.releaseQualifiableIdentity || identity?.buildSha !== expectedBuildSha) {
    throw new Error(`Runtime identity mismatch: expected ${expectedBuildSha}, received ${identity?.buildSha ?? 'UNKNOWN'}.`);
  }
  return { body, identity };
}

async function importFixture(personaId, persona, requestId) {
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
      headers: { 'x-ats-sys-03-request-id': requestId },
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
      personaId,
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
      personaId,
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
    personaId,
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

async function runWave({ concurrency, personas, waveId }) {
  const startedAt = new Date().toISOString();
  const wallStarted = performance.now();
  const requests = await Promise.all(
    Array.from({ length: concurrency }, (_, index) => {
      const personaId = REQUIRED_PERSONAS[index % REQUIRED_PERSONAS.length];
      return importFixture(personaId, personas[personaId], `${waveId}-${index + 1}`);
    }),
  );
  return {
    waveId,
    concurrency,
    startedAt,
    completedAt: new Date().toISOString(),
    wallLatencyMs: Math.round(performance.now() - wallStarted),
    summary: summarizeRequests(requests),
    requests,
  };
}

async function main() {
  const expectedBuildSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const personas = manifest.personas ?? {};
  for (const personaId of REQUIRED_PERSONAS) {
    if (!personas[personaId]?.sourceDocument || !personas[personaId]?.expectedTruth) {
      throw new Error(`Missing truth-known import fixture for ${personaId}.`);
    }
  }

  const levels = parseLevels(argValue('--levels'));
  const saturationConcurrency = Number(argValue('--saturation-concurrency') || DEFAULT_SATURATION_CONCURRENCY);
  if (!Number.isInteger(saturationConcurrency) || saturationConcurrency < 1) throw new Error('--saturation-concurrency must be a positive integer.');

  const startedAt = new Date().toISOString();
  const outputDir = resolve(
    process.env.CVENGINE_SYS03_EVIDENCE_DIR
      || `evidence/ats-sys-03/import-capacity/${isoSafe(startedAt)}`,
  );
  await mkdir(outputDir, { recursive: true });

  const initialHealth = await health(expectedBuildSha);
  const runtimeIdentity = await captureCanonicalRuntimeIdentity({
    expectedBuildSha,
    healthStatusCode: 200,
    healthBody: initialHealth.body,
  });

  const serial = [];
  for (const personaId of REQUIRED_PERSONAS) {
    const request = await importFixture(personaId, personas[personaId], `robustness-${personaId}`);
    serial.push(request);
    if (request.classification !== 'SUCCESS_TRUTH_SAFE') {
      throw new Error(`ATS-SYS-03A failed on ${personaId}: ${request.classification} ${request.errorCode ?? ''}`.trim());
    }
  }
  const robustness = {
    corpusVersion: manifest.version,
    synthetic: manifest.synthetic === true,
    documentFormats: ['DOCX'],
    uniqueTruthKnownDocuments: REQUIRED_PERSONAS.length,
    scope: 'INITIAL_SYNTHETIC_CORPUS_ONLY',
    summary: summarizeRequests(serial),
    requests: serial,
    result: 'PASS',
    claimBoundary: 'This proves the current four truth-known DOCX fixtures only. It does not establish arbitrary real-world CV robustness.',
  };
  await persist(resolve(outputDir, '01-robustness.json'), robustness);

  const capacityWaves = [];
  for (const concurrency of levels) {
    const wave = await runWave({ concurrency, personas, waveId: `capacity-c${concurrency}` });
    capacityWaves.push(wave);
    if (wave.summary.unsafeAcceptedTruth > 0) {
      throw new Error(`ATS-SYS-03B unsafe accepted truth at concurrency ${concurrency}.`);
    }
    if (wave.summary.rateLimited > 0) {
      throw new Error(`ATS-SYS-03B confounded by API rate limiting at concurrency ${concurrency}. Reduce request count before interpreting Ollama capacity.`);
    }
  }
  await persist(resolve(outputDir, '02-capacity-waves.json'), capacityWaves);

  const maxZeroFailureConcurrency = capacityWaves
    .filter((wave) => wave.summary.successTruthSafe === wave.summary.requests && wave.summary.unsafeAcceptedTruth === 0)
    .reduce((max, wave) => Math.max(max, wave.concurrency), 0);

  const saturation = await runWave({
    concurrency: saturationConcurrency,
    personas,
    waveId: `saturation-c${saturationConcurrency}`,
  });
  if (saturation.summary.unsafeAcceptedTruth > 0) {
    throw new Error(`ATS-SYS-03C unsafe accepted truth under saturation at concurrency ${saturationConcurrency}.`);
  }
  if (saturation.summary.rateLimited > 0) {
    throw new Error(`ATS-SYS-03C confounded by API rate limiting at concurrency ${saturationConcurrency}.`);
  }
  await persist(resolve(outputDir, '03-saturation.json'), saturation);

  const recoveryHealth = await health(expectedBuildSha);
  const recoveryRequest = await importFixture('P01', personas.P01, 'recovery-P01');
  const recovery = {
    healthStatus: recoveryHealth.body.status,
    request: recoveryRequest,
    result: recoveryRequest.classification === 'SUCCESS_TRUTH_SAFE' ? 'PASS' : 'FAIL',
  };
  await persist(resolve(outputDir, '04-recovery.json'), recovery);
  if (recovery.result !== 'PASS') {
    throw new Error(`ATS-SYS-03C recovery probe failed: ${recoveryRequest.classification}.`);
  }

  const totalRequests = serial.length
    + capacityWaves.reduce((sum, wave) => sum + wave.summary.requests, 0)
    + saturation.summary.requests
    + 1;
  const allRequests = [
    ...serial,
    ...capacityWaves.flatMap((wave) => wave.requests),
    ...saturation.requests,
    recoveryRequest,
  ];
  const aggregate = summarizeRequests(allRequests);

  const receipt = {
    receiptVersion: RECEIPT_VERSION,
    startedAt,
    completedAt: new Date().toISOString(),
    expectedBuildSha,
    runtimeProfileId: process.env.CVENGINE_RUNTIME_PROFILE_ID ?? 'UNDECLARED',
    runtimeIdentityRef: runtimeIdentity.runtimeIdentityRef,
    runtimeFingerprint: runtimeIdentity.runtimeIdentity,
    baseUrl: BASE_URL,
    corpus: {
      manifestRef: MANIFEST_PATH,
      fixtureDir: FIXTURE_DIR,
      uniqueTruthKnownDocuments: REQUIRED_PERSONAS.length,
      personas: REQUIRED_PERSONAS,
      synthetic: manifest.synthetic === true,
      formats: ['DOCX'],
    },
    robustness,
    capacity: {
      levels,
      waves: capacityWaves.map(({ requests: _requests, ...wave }) => wave),
      maxZeroFailureConcurrency,
      result: capacityWaves.every((wave) => wave.summary.unsafeAcceptedTruth === 0 && wave.summary.rateLimited === 0)
        ? 'OBSERVED_SAFE'
        : 'BLOCKED',
    },
    saturation: {
      concurrency: saturationConcurrency,
      summary: saturation.summary,
      wallLatencyMs: saturation.wallLatencyMs,
      result: saturation.summary.unsafeAcceptedTruth === 0 ? 'OBSERVED_SAFE' : 'UNSAFE',
    },
    recovery,
    aggregate,
    totalRequests,
    result: robustness.result === 'PASS'
      && aggregate.unsafeAcceptedTruth === 0
      && aggregate.rateLimited === 0
      && recovery.result === 'PASS'
      ? 'EVIDENCE_CAPTURED'
      : 'FAILED',
    policy: [
      'ATS-SYS-03 is observational until a larger representative corpus and explicit capacity budgets are approved.',
      'A safe refusal/timeout under pressure is allowed; any accepted candidate truth that violates the authored fixture truth envelope is a hard failure.',
      'Rate limiting must not be bypassed or disabled for this benchmark; a rate-limited wave is considered confounded, not evidence of Ollama capacity.',
      'Four synthetic DOCX fixtures are insufficient to claim arbitrary real-world PDF/DOCX robustness.',
    ],
  };
  await persist(resolve(outputDir, 'receipt.json'), receipt);

  process.stdout.write(`ATS-SYS-03A corpus: PASS (${robustness.summary.successTruthSafe}/${robustness.summary.requests})\n`);
  for (const wave of capacityWaves) {
    process.stdout.write(`ATS-SYS-03B c${wave.concurrency}: success=${wave.summary.successTruthSafe}/${wave.summary.requests}, safeFailure=${wave.summary.safeFailures}, p95=${wave.summary.latencyMs.p95} ms\n`);
  }
  process.stdout.write(`ATS-SYS-03C c${saturationConcurrency}: success=${saturation.summary.successTruthSafe}/${saturation.summary.requests}, safeFailure=${saturation.summary.safeFailures}, p95=${saturation.summary.latencyMs.p95} ms\n`);
  process.stdout.write(`Recovery: ${recovery.result}\n`);
  process.stdout.write(`Max zero-failure observed concurrency: ${maxZeroFailureConcurrency}\n`);
  process.stdout.write(`Unsafe accepted truth: ${aggregate.unsafeAcceptedTruth}\n`);
  process.stdout.write(`Evidence: ${outputDir}\n`);
  if (receipt.result !== 'EVIDENCE_CAPTURED') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
