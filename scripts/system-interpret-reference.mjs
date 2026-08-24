import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const REQUIRED_PERSONAS = ['P01', 'P03', 'P04', 'P09'];
const DEFAULT_POLICY_PATH = resolve('docs/system/ATS-SYS-02-RUNTIME-POLICY-v0.1.json');

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function persistJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path;
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function sameStringSet(actual, expected) {
  const a = [...new Set(actual)].sort();
  const b = [...new Set(expected)].sort();
  return JSON.stringify(a) === JSON.stringify(b);
}

function finiteNumber(value, label) {
  const number = Number(value);
  requireCondition(Number.isFinite(number), `${label} must be a finite number.`);
  return number;
}

function stats(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  requireCondition(sorted.length > 0, 'Cannot summarize an empty measurement set.');
  const sum = sorted.reduce((total, value) => total + value, 0);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  return {
    count: sorted.length,
    min: sorted[0],
    median: Math.round(median),
    mean: Math.round(sum / sorted.length),
    max: sorted.at(-1),
    samples: sorted,
  };
}

function runId(index) {
  return `run-${String(index).padStart(2, '0')}`;
}

function runtimeHostFingerprint(runtimeIdentity) {
  return JSON.stringify({
    profileId: runtimeIdentity?.host?.profileId,
    cpu: runtimeIdentity?.host?.cpu,
    cores: runtimeIdentity?.host?.cores,
    memoryBytes: runtimeIdentity?.host?.memoryBytes,
    operatingSystem: runtimeIdentity?.host?.operatingSystem,
    architecture: runtimeIdentity?.host?.architecture,
  });
}

function mergeServiceMax(target, source) {
  for (const [service, rawValue] of Object.entries(source || {})) {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;
    target[service] = Math.max(target[service] ?? 0, value);
  }
}

async function main() {
  const rootValue = argValue('--reference-run') || process.env.CVENGINE_REFERENCE_RUN_DIR;
  if (!rootValue) {
    throw new Error('Usage: node scripts/system-interpret-reference.mjs --reference-run <reference-run-dir> [--policy <policy.json>]');
  }

  const root = resolve(rootValue);
  const policyPath = resolve(argValue('--policy') || process.env.CVENGINE_RUNTIME_POLICY_PATH || DEFAULT_POLICY_PATH);
  const manifestPath = resolve(root, 'reference-run-manifest.json');
  const manifest = await readJson(manifestPath);
  const policy = await readJson(policyPath);

  requireCondition(policy.policyVersion === 'ats-sys-02-runtime-policy-v0.1', 'Unexpected ATS-SYS-02 runtime policy version.');
  requireCondition(policy.status === 'APPROVED', 'Runtime policy is not approved.');
  requireCondition(policy.supportScope === 'EXACT_OBSERVED_RUNTIME_FINGERPRINT_ONLY', 'Runtime policy must remain exact-fingerprint scoped.');
  requireCondition(manifest.runtimeProfileId === policy.runtimeProfileId, `Reference profile ${manifest.runtimeProfileId} does not match policy ${policy.runtimeProfileId}.`);
  requireCondition(typeof manifest.build?.sha === 'string' && manifest.build.sha.length > 0, 'Reference manifest has no build SHA.');

  const requiredRuns = policy.minimumRepeatedRuns || {};
  const personaRunCount = Number(manifest.repetitions?.canonicalPersonas || 0);
  const optimizeRunCount = Number(manifest.repetitions?.inlineOptimize || 0);
  const coldStartRunCount = Number(manifest.repetitions?.coldStart || 0);
  requireCondition(personaRunCount >= Number(requiredRuns.canonicalPersonas || 0), 'Not enough repeated canonical persona runs for policy interpretation.');
  requireCondition(optimizeRunCount >= Number(requiredRuns.inlineOptimize || 0), 'Not enough repeated Inline Optimize runs for policy interpretation.');
  requireCondition(coldStartRunCount >= Number(requiredRuns.containerColdStart || 0), 'Not enough repeated cold-start runs for policy interpretation.');

  const coldStartPath = resolve(root, 'cold-start', 'cold-start-receipt.json');
  const coldStart = await readJson(coldStartPath);
  requireCondition(coldStart.result === 'PASS', 'Cold-start receipt is not PASS.');
  requireCondition(coldStart.expectedBuildSha === manifest.build.sha, 'Cold-start build SHA does not match the reference manifest.');
  requireCondition(coldStart.runtimeProfileId === manifest.runtimeProfileId, 'Cold-start runtime profile does not match the reference manifest.');
  requireCondition(Array.isArray(coldStart.attempts) && coldStart.attempts.length >= Number(requiredRuns.containerColdStart || 0), 'Cold-start receipt lacks repeated attempts.');

  const coldStartLatencies = coldStart.attempts.map((attempt, index) => {
    requireCondition(attempt.result === 'PASS', `Cold-start attempt ${index + 1} is not PASS.`);
    return finiteNumber(attempt.readyLatencyMs, `cold-start attempt ${index + 1} latency`);
  });

  const releaseFingerprints = new Set();
  const runtimeHostFingerprints = new Set();
  const runtimeObservationRefs = [];
  const releaseEvaluationRefs = [];
  const personaReceiptRefs = [];
  const optimizeReceiptRefs = [];
  const personaLatencies = Object.fromEntries(REQUIRED_PERSONAS.map((personaId) => [personaId, []]));
  const aggregatePersonaLatencies = [];
  const optimizeLatencies = [];
  const optimizeModes = [];
  const maxMemoryMiBByService = {};
  const maxCpuPercentByService = {};
  let maxAggregateMemoryMiB = 0;
  let observedRuntimeIdentity;

  for (let index = 1; index <= personaRunCount; index += 1) {
    const id = runId(index);
    const evaluationPath = resolve(root, 'release-evaluations', id, 'release-gate-evaluation.json');
    const evaluation = await readJson(evaluationPath);
    releaseEvaluationRefs.push(evaluationPath);
    requireCondition(
      evaluation.ready === false
        && sameStringSet(evaluation.blockingCriteria || [], ['latency-budgets', 'runtime-envelope']),
      `${id} pre-interpretation release evaluation has unexpected blockers.`,
    );
    requireCondition(typeof evaluation.runtimeFingerprint === 'string' && evaluation.runtimeFingerprint.length > 0, `${id} has no runtime fingerprint.`);
    releaseFingerprints.add(evaluation.runtimeFingerprint);

    const observationPath = resolve(root, 'persona-runs', id, 'runtime-observation.json');
    const observation = await readJson(observationPath);
    runtimeObservationRefs.push(observationPath);
    requireCondition(observation.status === 'OBSERVED', `${id} runtime observation is not OBSERVED.`);
    requireCondition(observation.runtimeIdentity?.buildSha === manifest.build.sha, `${id} runtime observation build mismatch.`);
    requireCondition(observation.runtimeIdentity?.runtimeProfile === manifest.runtimeProfileId, `${id} runtime observation profile mismatch.`);
    runtimeHostFingerprints.add(runtimeHostFingerprint(observation.runtimeIdentity));
    observedRuntimeIdentity ??= observation.runtimeIdentity;
    maxAggregateMemoryMiB = Math.max(maxAggregateMemoryMiB, Number(observation.dockerServices?.maxAggregateMemoryMiB || 0));
    mergeServiceMax(maxMemoryMiBByService, observation.dockerServices?.maxMemoryMiBByService);
    mergeServiceMax(maxCpuPercentByService, observation.dockerServices?.maxCpuPercentByService);

    for (const personaId of REQUIRED_PERSONAS) {
      const receiptPath = resolve(root, 'persona-runs', id, 'personas', personaId, 'receipt.json');
      const receipt = await readJson(receiptPath);
      personaReceiptRefs.push(receiptPath);
      requireCondition(receipt.accepted === true, `${id}/${personaId} is not accepted.`);
      requireCondition(receipt.identity?.buildSha === manifest.build.sha, `${id}/${personaId} build mismatch.`);
      requireCondition(receipt.identity?.runtimeProfileId === manifest.runtimeProfileId, `${id}/${personaId} runtime profile mismatch.`);
      const latency = finiteNumber(receipt.measurements?.totalLatencyMs, `${id}/${personaId} total latency`);
      personaLatencies[personaId].push(latency);
      aggregatePersonaLatencies.push(latency);
    }
  }

  for (let index = 1; index <= optimizeRunCount; index += 1) {
    const id = runId(index);
    const receiptPath = resolve(root, 'inline-optimize-runs', id, 'receipt.json');
    const receipt = await readJson(receiptPath);
    optimizeReceiptRefs.push(receiptPath);
    requireCondition(receipt.result === 'OBSERVED', `${id} Inline Optimize receipt is not OBSERVED.`);
    requireCondition(receipt.productCapabilityResult === 'PASS', `${id} Inline Optimize product capability did not pass.`);
    requireCondition(receipt.truthSafety?.pass === true, `${id} Inline Optimize truth safety failed.`);
    requireCondition(receipt.identity?.buildSha === manifest.build.sha, `${id} Inline Optimize build mismatch.`);
    requireCondition(receipt.identity?.runtimeProfileId === manifest.runtimeProfileId, `${id} Inline Optimize runtime profile mismatch.`);
    optimizeLatencies.push(finiteNumber(receipt.observations?.optimizeLatencyMs, `${id} Inline Optimize latency`));
    optimizeModes.push(receipt.aiWorkloadResult);
  }

  requireCondition(releaseFingerprints.size === 1, `Repeated release evaluations describe ${releaseFingerprints.size} runtime fingerprints.`);
  requireCondition(runtimeHostFingerprints.size === 1, `Repeated runtime observations describe ${runtimeHostFingerprints.size} host fingerprints.`);

  const runtimeFingerprint = [...releaseFingerprints][0];
  const coldStats = stats(coldStartLatencies);
  const personaStats = Object.fromEntries(REQUIRED_PERSONAS.map((personaId) => [personaId, stats(personaLatencies[personaId])]));
  const allPersonaStats = stats(aggregatePersonaLatencies);
  const optimizeStats = stats(optimizeLatencies);
  const budgets = policy.latencyBudgets;

  const budgetChecks = {
    containerColdStartReady: {
      budgetMs: finiteNumber(budgets.containerColdStartReadyMs, 'container cold-start budget'),
      observedMaxMs: coldStats.max,
      pass: coldStats.max <= Number(budgets.containerColdStartReadyMs),
    },
    canonicalPersonaEndToEnd: {
      budgetMs: finiteNumber(budgets.canonicalPersonaEndToEndMs, 'canonical persona budget'),
      observedMaxMs: allPersonaStats.max,
      pass: allPersonaStats.max <= Number(budgets.canonicalPersonaEndToEndMs),
    },
    inlineOptimizeProductResponse: {
      budgetMs: finiteNumber(budgets.inlineOptimizeProductResponseMs, 'Inline Optimize response budget'),
      observedMaxMs: optimizeStats.max,
      pass: optimizeStats.max <= Number(budgets.inlineOptimizeProductResponseMs),
    },
  };

  const runtimeEnvelopePass = runtimeFingerprint.length > 0
    && runtimeHostFingerprints.size === 1
    && Boolean(observedRuntimeIdentity)
    && personaRunCount >= Number(requiredRuns.canonicalPersonas)
    && optimizeRunCount >= Number(requiredRuns.inlineOptimize)
    && coldStartLatencies.length >= Number(requiredRuns.containerColdStart);
  const latencyBudgetsPass = Object.values(budgetChecks).every((check) => check.pass === true);
  const safeFallbackCount = optimizeModes.filter((value) => value === 'SAFE_FALLBACK').length;
  const aiCompletedCount = optimizeModes.filter((value) => value === 'AI_COMPLETED').length;
  const optimizeCapabilityAllowed = policy.capabilityPolicy?.inlineOptimizeAiCompletionRequired === true
    ? aiCompletedCount === optimizeModes.length
    : optimizeModes.every((value) => ['AI_COMPLETED', 'SAFE_FALLBACK'].includes(value));

  const interpretationDir = resolve(root, 'interpretation');
  await mkdir(interpretationDir, { recursive: true });
  const interpretation = {
    interpretationVersion: 'ats-sys-02-reference-interpretation-v0.1',
    interpretedAt: new Date().toISOString(),
    policyVersion: policy.policyVersion,
    policyRef: policyPath,
    buildSha: manifest.build.sha,
    runtimeProfileId: manifest.runtimeProfileId,
    runtimeFingerprint,
    runtimeEnvelope: {
      status: runtimeEnvelopePass ? 'PASS' : 'FAIL',
      supportScope: policy.supportScope,
      exactObservedRuntime: {
        host: observedRuntimeIdentity?.host,
        container: observedRuntimeIdentity?.container,
        ai: observedRuntimeIdentity?.ai,
        redis: observedRuntimeIdentity?.redis,
      },
      repeatedRuns: {
        coldStart: coldStartLatencies.length,
        canonicalPersonaRuns: personaRunCount,
        inlineOptimizeRuns: optimizeRunCount,
      },
      resourceObservations: {
        maxAggregateMemoryMiB,
        maxMemoryMiBByService,
        maxCpuPercentByService,
      },
      evidenceRefs: [coldStartPath, ...runtimeObservationRefs, ...releaseEvaluationRefs],
      uncharacterizedClaims: policy.uncharacterizedClaims,
      detail: runtimeEnvelopePass
        ? 'Support is approved only for this exact observed runtime fingerprint. No weaker or merely similar hardware is inferred to be supported.'
        : 'Repeated evidence did not establish one exact characterized runtime fingerprint.',
    },
    latencyBudgets: {
      status: latencyBudgetsPass && optimizeCapabilityAllowed ? 'PASS' : 'FAIL',
      policy: budgets,
      checks: budgetChecks,
      observations: {
        coldStartReadyMs: coldStats,
        canonicalPersonaEndToEndMs: {
          aggregate: allPersonaStats,
          byPersona: personaStats,
        },
        inlineOptimizeProductResponseMs: optimizeStats,
      },
      inlineOptimize: {
        capabilityClass: policy.capabilityPolicy?.inlineOptimize,
        aiCompletionRequired: policy.capabilityPolicy?.inlineOptimizeAiCompletionRequired,
        safeFallbackAccepted: policy.capabilityPolicy?.inlineOptimizeSafeFallbackAccepted,
        aiCompletedCount,
        safeFallbackCount,
        observedModes: optimizeModes,
        capabilityAllowed: optimizeCapabilityAllowed,
      },
      evidenceRefs: [...personaReceiptRefs, ...optimizeReceiptRefs, coldStartPath],
      detail: latencyBudgetsPass && optimizeCapabilityAllowed
        ? 'Every measured required workload satisfied the approved v0.1 latency policy; optional Inline Optimize remained truth-safe and within its product-response budget.'
        : 'One or more measured workloads violated the approved latency/capability policy.',
    },
    qualifiesForReleaseEvaluation: runtimeEnvelopePass && latencyBudgetsPass && optimizeCapabilityAllowed,
    policy: 'Interpretation converts repeated measurements into release-policy evidence only under an explicit approved policy. It does not generalize the observed host into a lower hardware minimum or cross-host equivalence claim.',
  };

  const interpretationPath = await persistJson(resolve(interpretationDir, 'reference-interpretation.json'), interpretation);
  process.stdout.write(`Runtime envelope: ${interpretation.runtimeEnvelope.status}\n`);
  process.stdout.write(`Latency budgets: ${interpretation.latencyBudgets.status}\n`);
  process.stdout.write(`Reference interpretation: ${interpretationPath}\n`);
  if (!interpretation.qualifiesForReleaseEvaluation) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
