import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  RUNTIME_IDENTITY_CONTRACT_VERSION,
  RUNTIME_IDENTITY_EVIDENCE_VERSION,
  type RuntimeIdentityEvidence,
  validateRuntimeIdentityEvidence,
} from '../../lib/application/system/RuntimeIdentityEvidence';
import { resolveRuntimeIdentity } from '../../lib/application/system/RuntimeIdentity';

function baseEvidence(): RuntimeIdentityEvidence {
  const sourceIdentity = resolveRuntimeIdentity({
    CVENGINE_BUILD_SHA: 'build-123',
    CVENGINE_RUNTIME_PROFILE_ID: 'REFERENCE-CPU-01',
  });

  return {
    runtimeIdentityVersion: RUNTIME_IDENTITY_EVIDENCE_VERSION,
    buildSha: sourceIdentity.buildSha,
    architectureVersion: sourceIdentity.architectureVersion,
    contractVersion: RUNTIME_IDENTITY_CONTRACT_VERSION,
    environment: 'production',
    runtimeProfile: sourceIdentity.runtimeProfileId,
    sourceIdentity,
    host: {
      profileId: sourceIdentity.runtimeProfileId,
      cpu: 'Reference CPU',
      cores: 8,
      memoryBytes: 16 * 1024 ** 3,
      operatingSystem: 'linux test',
      architecture: 'x64',
    },
    container: {
      image: 'cv-engine-app',
      imageDigest: 'sha256:abc123',
      dockerVersion: '28.0.0',
    },
    capabilities: {
      resumeImport: {
        configured: true,
        observedState: 'READY',
        provider: 'ollama',
        model: 'qwen3:1.7b',
      },
      jobIntelligence: {
        configured: true,
        observedState: 'UNKNOWN',
      },
      opportunityAssessment: {
        configured: true,
        observedState: 'UNKNOWN',
      },
      deterministicComposer: {
        configured: true,
        observedState: 'CONFIGURED',
        provider: 'cv-engine-deterministic',
        model: 'source-preserving-resume-composer-v2',
        contractVersion: 'ats2-evidence-bound-resume-v2',
      },
      inlineOptimize: {
        configured: true,
        observedState: 'READY',
        provider: 'ollama',
        model: 'qwen3:4b-instruct',
      },
      persistence: {
        configured: true,
        observedState: 'READY',
      },
    },
    ai: {
      provider: 'ollama',
      endpoint: 'http://ollama:11434',
      capabilities: {
        resumeImport: {
          resolvedModel: 'qwen3:1.7b',
          modelVersion: 'UNKNOWN',
          capability: 'resumeImport',
        },
        inlineOptimize: {
          resolvedModel: 'qwen3:4b-instruct',
          modelVersion: 'UNKNOWN',
          capability: 'inlineOptimize',
        },
      },
    },
    redis: {
      provider: 'redis:7-alpine via hiett/serverless-redis-http:latest',
      connectivity: 'READY',
      namespace: 'UNKNOWN',
      environment: 'production',
      endpoint: 'http://redis-http:80',
    },
    capturedAt: '2026-08-21T12:00:00.000Z',
  };
}

test('ATS-SYS-02 accepts a complete identified runtime evidence snapshot while preserving explicit UNKNOWN fields', () => {
  const evidence = baseEvidence();
  const evaluation = validateRuntimeIdentityEvidence(evidence);

  assert.equal(evaluation.valid, true);
  assert.deepEqual(evaluation.blockingReasons, []);
  assert.equal(evidence.ai.capabilities.resumeImport.modelVersion, 'UNKNOWN');
  assert.equal(evidence.redis.namespace, 'UNKNOWN');
  assert.equal(evidence.capabilities.jobIntelligence.observedState, 'UNKNOWN');
});

test('ATS-SYS-02 rejects runtime evidence whose canonical build/profile no longer matches ATS-SYS-01 identity', () => {
  const evidence = baseEvidence();
  const evaluation = validateRuntimeIdentityEvidence({
    ...evidence,
    buildSha: 'different-build',
    runtimeProfile: 'DIFFERENT-PROFILE',
  });

  assert.equal(evaluation.valid, false);
  assert.ok(evaluation.blockingReasons.includes('build-sha-mismatch'));
  assert.ok(evaluation.blockingReasons.includes('runtime-profile-mismatch'));
  assert.ok(evaluation.blockingReasons.includes('host-profile-mismatch'));
});

test('ATS-SYS-02 runtime capture records host/container/provider/persistence evidence and never reads Redis credentials', () => {
  const source = readFileSync('scripts/system-runtime-identity.mjs', 'utf8');
  assert.match(source, /captureCanonicalRuntimeIdentity/);
  assert.match(source, /imageDigest/);
  assert.match(source, /dockerVersion/);
  assert.match(source, /resumeImport/);
  assert.match(source, /inlineOptimize/);
  assert.match(source, /UPSTASH_REDIS_REST_URL/);
  assert.doesNotMatch(source, /UPSTASH_REDIS_REST_TOKEN/);
  assert.match(source, /modelVersion:\s*'UNKNOWN'/);
  assert.match(source, /namespace:\s*'UNKNOWN'/);
});

test('ATS-SYS-02 cold-start receipt is runtime-bound and records readiness events without inventing first product request evidence', () => {
  const source = readFileSync('scripts/system-cold-start.mjs', 'utf8');
  assert.match(source, /captureCanonicalRuntimeIdentity/);
  assert.match(source, /runtimeIdentityRef/);
  assert.match(source, /containerStartAt/);
  assert.match(source, /trustedCoreReadyAt/);
  assert.match(source, /redisReadyAt/);
  assert.match(source, /providerResolutionAt/);
  assert.match(source, /modelResolutionAt/);
  assert.match(source, /aiCapabilityReadyAt/);
  assert.match(source, /firstTrustedRequestAt:\s*null/);
  assert.match(source, /UNKNOWN_NOT_EXERCISED_BY_COLD_START/);
  assert.match(source, /latencyBudgetApplied:\s*false/);
});

test('ATS-SYS-02 cold-start provisions required Ollama models before timing while retaining volumes', () => {
  const source = readFileSync('scripts/system-cold-start.mjs', 'utf8');

  assert.match(source, /provisionModelsBeforeMeasurement/);
  assert.match(source, /identifiedCompose\('up', '-d', 'ollama'\)/);
  assert.match(source, /identifiedCompose\('run', '--rm', 'ollama-init'\)/);
  assert.match(source, /MODELS_PRESENT_IN_RETAINED_VOLUME_BEFORE_MEASUREMENT/);
  assert.match(source, /measured:\s*false/);
  assert.match(source, /pre-measurement-provisioning\.json/);
  assert.match(source, /preMeasurementProvisioningRef/);
  assert.match(source, /Required model provisioning is explicitly performed before timing/i);
  assert.doesNotMatch(source, /down[^\n]*-v/);
});

test('ATS-SYS-02 normal runtime characterization persists raw samples bound to the canonical runtime', () => {
  const source = readFileSync('scripts/system-characterize-runtime.mjs', 'utf8');
  assert.match(source, /captureCanonicalRuntimeIdentity/);
  assert.match(source, /runtimeIdentityRef/);
  assert.match(source, /runtime-samples\.json/);
  assert.match(source, /sampledAt/);
  assert.match(source, /aggregateMemoryMiB/);
  assert.match(source, /Measurements are observations only/);
});

test('ATS-SYS-02 persona and Inline Optimize receipts point to the exact runtime evidence artifact', () => {
  const personaSource = readFileSync('scripts/system-characterize.mjs', 'utf8');
  const optimizeSource = readFileSync('scripts/system-characterize-inline-optimize.mjs', 'utf8');

  assert.match(personaSource, /runtimeIdentityRef/);
  assert.match(personaSource, /fixtureRef/);
  assert.match(personaSource, /canonical-persona-e2e/);
  assert.match(optimizeSource, /runtimeIdentityRef/);
  assert.match(optimizeSource, /fixtureRef/);
  assert.match(optimizeSource, /ats-sys-02-inline-optimize-observation-v0\.1/);
  assert.match(optimizeSource, /budgetApplied:\s*false/);
});

test('ATS-SYS-02 P10 exercises affected capabilities, verifies no trusted success, and requires full runtime recovery', () => {
  const source = readFileSync('scripts/system-fault-injection.mjs', 'utf8');
  assert.match(source, /ats-sys-02-fault-receipt-v0\.2/);
  assert.match(source, /probeLocalAiFailure/);
  assert.match(source, /SAFE_FAILURE_NO_CANDIDATE_TRUTH_ACCEPTED/);
  assert.match(source, /candidateTruthAccepted:\s*false/);
  assert.match(source, /probeDurableFailure/);
  assert.match(source, /FAIL_CLOSED_BEFORE_TRUSTED_DURABLE_SUCCESS/);
  assert.match(source, /persistenceStage:\s*result\.body\?\.persistence\?\.stage/);
  assert.match(source, /trustedDurableSuccessEmitted:\s*false/);
  assert.match(source, /waitForFullRecovery/);
  assert.match(source, /sameRuntimeIdentity/);
  assert.match(source, /health\.body\?\.status === 'READY'/);
  assert.match(source, /dependencies\?\.localAI\?\.status === 'READY'/);
  assert.match(source, /dependencies\?\.durableRedis\?\.status === 'READY'/);
  assert.match(source, /degradedCapabilities/);
  assert.match(source, /unavailableCapabilities/);
  assert.match(source, /faultDetectionLatencyMs/);
});

test('ATS-SYS-02 release evaluator refuses legacy health-only P10 PASS receipts', () => {
  const source = readFileSync('scripts/system-release-evaluate.mjs', 'utf8');
  assert.match(source, /faultReceiptPasses/);
  assert.match(source, /ats-sys-02-fault-receipt-v0\.2/);
  assert.match(source, /capabilityProbe\?\.result === 'PASS'/);
  assert.match(source, /capabilityProbe\?\.evidenceRef/);
  assert.match(source, /recoveryObserved\?\.restored === true/);
  assert.match(source, /behavioral fault receipts/);
});

test('ATS-SYS-02 reference runner refuses ambiguous source/runtime identity and keeps generated evidence outside the runtime image', () => {
  const source = readFileSync('scripts/system-reference-run.mjs', 'utf8');
  const dockerIgnore = readFileSync('.dockerignore', 'utf8');

  assert.match(source, /REFERENCE-CPU-01/);
  assert.match(source, /--porcelain=v1/);
  assert.match(source, /--untracked-files=all/);
  assert.match(source, /requires committed source/);
  assert.match(source, /GENERATED_EVIDENCE_PREFIX = 'evidence\/ats-sys-02\/'/);
  assert.match(source, /Refusing to label an undeclared host/);
  assert.match(dockerIgnore, /^evidence\/ats-sys-02$/m);
  assert.doesNotMatch(source, /down[^\n]*-v/);
  assert.doesNotMatch(source, /docker compose down -v/);
});

test('ATS-SYS-02 reference runner preserves pre-interpretation blockers, then qualifies only through interpreted policy evidence', () => {
  const source = readFileSync('scripts/system-reference-run.mjs', 'utf8');
  assert.match(source, /personaRepetitions.*3/);
  assert.match(source, /optimizeRepetitions/);
  assert.match(source, /coldStartRepetitions.*3/);
  assert.match(source, /system-characterize-runtime\.mjs/);
  assert.match(source, /system-characterize-inline-optimize\.mjs/);
  assert.match(source, /system-fault-injection\.mjs/);
  assert.match(source, /system-release-evaluate\.mjs/);
  assert.match(source, /EXPECTED_POLICY_BLOCKERS = \['latency-budgets', 'runtime-envelope'\]/);
  assert.match(source, /BLOCKED_PENDING_INTERPRETATION/);
  assert.match(source, /system-interpret-reference\.mjs/);
  assert.match(source, /BLOCKED_POLICY_VIOLATION/);
  assert.match(source, /system-release-qualify\.mjs/);
  assert.match(source, /releaseStatus = 'QUALIFIED'/);
  assert.match(source, /runtimeEnvelopeStatus = 'PASS'/);
  assert.match(source, /latencyBudgetStatus = 'PASS'/);
  assert.match(source, /lower-spec\/cross-host support remains explicitly uncharacterized/i);
});
