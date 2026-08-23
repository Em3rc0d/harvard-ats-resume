import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const REQUIRED_PROFILE = 'REFERENCE-CPU-01';
const EXPECTED_POLICY_BLOCKERS = ['latency-budgets', 'runtime-envelope'];
const GENERATED_EVIDENCE_PREFIX = 'evidence/ats-sys-02/';
const REFERENCE_COMPOSE_PROJECT = 'cv-engine-reference';
const REFERENCE_APP_PORT = '3100';
const REFERENCE_OLLAMA_PORT = '31434';
const REFERENCE_REDIS_HTTP_PORT = '38079';
const REFERENCE_BASE_URL = `http://127.0.0.1:${REFERENCE_APP_PORT}`;

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isoSafe(value) {
  return value.replace(/[:.]/g, '-');
}

function positiveInteger(value, label, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

function command(commandName, args, options = {}) {
  return execFileSync(commandName, args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  }).trim();
}

async function persistJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function ensureSourceIdentifiableRepository() {
  const status = command('git', ['status', '--porcelain=v1', '--untracked-files=all']);
  if (!status) return { ignoredGeneratedEvidence: [] };

  const lines = status.split(/\r?\n/).filter(Boolean);
  const ignoredGeneratedEvidence = [];
  const sourceChanges = [];
  for (const line of lines) {
    const code = line.slice(0, 2);
    const path = line.slice(3).replace(/\\/g, '/');
    if (code === '??' && path.startsWith(GENERATED_EVIDENCE_PREFIX)) {
      ignoredGeneratedEvidence.push(path);
      continue;
    }
    sourceChanges.push(line);
  }

  if (sourceChanges.length > 0) {
    throw new Error(
      `REFERENCE-CPU-01 evidence requires committed source. Resolve these Git changes before execution: ${sourceChanges.join(' | ')}`,
    );
  }

  return { ignoredGeneratedEvidence };
}

function ensureReferenceProfile() {
  const profile = process.env.CVENGINE_RUNTIME_PROFILE_ID?.trim();
  if (profile !== REQUIRED_PROFILE) {
    throw new Error(`Set CVENGINE_RUNTIME_PROFILE_ID=${REQUIRED_PROFILE}. Refusing to label an undeclared host as the reference runtime.`);
  }
  return profile;
}

function runNodeStep({ id, script, args = [], env, acceptedExitCodes = [0] }) {
  const startedAt = new Date().toISOString();
  process.stdout.write(`\n[ATS-SYS-02] ${id}\n`);
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: 'inherit',
    env,
  });
  if (result.error) throw result.error;
  const exitCode = result.status ?? 1;
  return {
    id,
    script,
    args,
    startedAt,
    completedAt: new Date().toISOString(),
    exitCode,
    result: acceptedExitCodes.includes(exitCode) ? 'PASS' : 'FAIL',
  };
}

function assertStep(step, acceptedExitCodes = [0]) {
  if (!acceptedExitCodes.includes(step.exitCode)) {
    throw new Error(`${step.id} failed with exit ${step.exitCode}.`);
  }
}

function sameStringSet(actual, expected) {
  const a = [...new Set(actual)].sort();
  const b = [...new Set(expected)].sort();
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const runtimeProfileId = ensureReferenceProfile();
  const sourceStatus = ensureSourceIdentifiableRepository();

  // Only committed source may affect the application image. Prior untracked
  // ATS-SYS-02 evidence is permitted because .dockerignore excludes it from the
  // image context and it cannot alter the runtime being characterized.
  const buildSha = command('git', ['rev-parse', 'HEAD']);
  const branch = command('git', ['branch', '--show-current']) || 'DETACHED';
  const nodeVersion = process.version;
  const dockerVersion = command('docker', ['version', '--format', '{{.Server.Version}}']);
  const personaRepetitions = positiveInteger(argValue('--persona-repetitions'), '--persona-repetitions', 3);
  const optimizeRepetitions = positiveInteger(argValue('--optimize-repetitions'), '--optimize-repetitions', personaRepetitions);
  const coldStartRepetitions = positiveInteger(argValue('--cold-start-repetitions'), '--cold-start-repetitions', 3);

  const startedAt = new Date().toISOString();
  const root = resolve(
    process.env.CVENGINE_REFERENCE_RUN_DIR
      || `evidence/ats-sys-02/reference-runs/${isoSafe(startedAt)}`,
  );
  const runtimeIdentityRoot = resolve(root, 'runtime-identities');
  const coldStartDir = resolve(root, 'cold-start');
  const personaRoot = resolve(root, 'persona-runs');
  const optimizeRoot = resolve(root, 'inline-optimize-runs');
  const faultDir = resolve(root, 'faults');
  const releaseRoot = resolve(root, 'release-evaluations');
  await Promise.all([
    mkdir(runtimeIdentityRoot, { recursive: true }),
    mkdir(coldStartDir, { recursive: true }),
    mkdir(personaRoot, { recursive: true }),
    mkdir(optimizeRoot, { recursive: true }),
    mkdir(faultDir, { recursive: true }),
    mkdir(releaseRoot, { recursive: true }),
  ]);

  // Reference characterization owns a dedicated Compose project plus dedicated
  // loopback host ports for the app and externally published dependencies.
  // Product containers still communicate over their canonical internal Compose
  // addresses (ollama:11434, redis-http:80). Normal product/dev traffic therefore
  // cannot stop, recreate, share volumes with, or consume the benchmark stack.
  const sharedEnv = {
    ...process.env,
    COMPOSE_PROJECT_NAME: REFERENCE_COMPOSE_PROJECT,
    CVENGINE_RUNTIME_PROFILE_ID: runtimeProfileId,
    CVENGINE_EXPECTED_BUILD_SHA: buildSha,
    CVENGINE_RUNTIME_IDENTITY_DIR: runtimeIdentityRoot,
    CVENGINE_APP_PORT: REFERENCE_APP_PORT,
    CVENGINE_OLLAMA_PORT: REFERENCE_OLLAMA_PORT,
    CVENGINE_REDIS_HTTP_PORT: REFERENCE_REDIS_HTTP_PORT,
    CV_ENGINE_E2E_BASE_URL: REFERENCE_BASE_URL,
  };

  const manifest = {
    manifestVersion: 'ats-sys-02-reference-run-v0.1',
    startedAt,
    completedAt: null,
    executionStatus: 'RUNNING',
    releaseStatus: 'UNKNOWN',
    runtimeEnvelopeStatus: 'UNCHARACTERIZED',
    latencyBudgetStatus: 'UNCHARACTERIZED',
    build: {
      sha: buildSha,
      branch,
      sourceIdentifiable: true,
      ignoredGeneratedEvidenceCount: sourceStatus.ignoredGeneratedEvidence.length,
      nodeVersion,
      dockerVersion,
    },
    runtimeProfileId,
    isolation: {
      mode: 'DEDICATED_COMPOSE_PROJECT_AND_LOOPBACK_RUNTIME_PORTS',
      composeProject: REFERENCE_COMPOSE_PROJECT,
      appPort: Number(REFERENCE_APP_PORT),
      ollamaHostPort: Number(REFERENCE_OLLAMA_PORT),
      redisHttpHostPort: Number(REFERENCE_REDIS_HTTP_PORT),
      baseUrl: REFERENCE_BASE_URL,
      normalHostPortsExcluded: [3000, 11434, 8079],
      note: 'Reference containers/network/volumes are project-isolated; internal trusted dependency addresses remain canonical.',
    },
    repetitions: {
      coldStart: coldStartRepetitions,
      canonicalPersonas: personaRepetitions,
      inlineOptimize: optimizeRepetitions,
      faults: 1,
    },
    paths: {
      root,
      runtimeIdentityRoot,
      coldStartDir,
      personaRoot,
      optimizeRoot,
      faultDir,
      releaseRoot,
    },
    steps: [],
    policy: 'Instrumentation and execution evidence only. EVIDENCE_CAPTURED != supported runtime; observed latency != approved budget; UNKNOWN/UNCHARACTERIZED != PASS. Generated ATS-SYS-02 evidence is excluded from the Docker image context.',
  };
  const manifestPath = resolve(root, 'reference-run-manifest.json');
  await persistJson(manifestPath, manifest);

  const record = async (step) => {
    manifest.steps.push(step);
    await persistJson(manifestPath, manifest);
  };

  try {
    const coldStep = runNodeStep({
      id: 'cold-start',
      script: 'scripts/system-cold-start.mjs',
      args: ['--repetitions', String(coldStartRepetitions)],
      env: {
        ...sharedEnv,
        CVENGINE_SYSTEM_COLD_START_DIR: coldStartDir,
      },
    });
    await record(coldStep);
    assertStep(coldStep);

    const personaRuns = [];
    for (let index = 1; index <= personaRepetitions; index += 1) {
      const runId = `run-${String(index).padStart(2, '0')}`;
      const bundleDir = resolve(personaRoot, runId);
      const step = runNodeStep({
        id: `canonical-personas:${runId}`,
        script: 'scripts/system-characterize-runtime.mjs',
        env: {
          ...sharedEnv,
          CVENGINE_SYSTEM_BUNDLE_DIR: bundleDir,
        },
      });
      await record({ ...step, evidenceDir: bundleDir });
      assertStep(step);
      personaRuns.push({ runId, bundleDir, personaDir: resolve(bundleDir, 'personas') });
    }

    for (let index = 1; index <= optimizeRepetitions; index += 1) {
      const runId = `run-${String(index).padStart(2, '0')}`;
      const evidenceDir = resolve(optimizeRoot, runId);
      const step = runNodeStep({
        id: `inline-optimize:${runId}`,
        script: 'scripts/system-characterize-inline-optimize.mjs',
        env: {
          ...sharedEnv,
          CVENGINE_OPTIMIZE_EVIDENCE_DIR: evidenceDir,
        },
      });
      await record({ ...step, evidenceDir });
      assertStep(step);
    }

    const faultStep = runNodeStep({
      id: 'p10-faults',
      script: 'scripts/system-fault-injection.mjs',
      env: {
        ...sharedEnv,
        CVENGINE_SYSTEM_EVIDENCE_DIR: faultDir,
      },
    });
    await record({ ...faultStep, evidenceDir: faultDir });
    assertStep(faultStep);

    const coldStartReceipt = resolve(coldStartDir, 'cold-start-receipt.json');
    const releaseEvaluations = [];
    for (const personaRun of personaRuns) {
      const outputDir = resolve(releaseRoot, personaRun.runId);
      const step = runNodeStep({
        id: `release-evaluate:${personaRun.runId}`,
        script: 'scripts/system-release-evaluate.mjs',
        args: [
          '--persona-run', personaRun.personaDir,
          '--fault-run', faultDir,
          '--cold-start', coldStartReceipt,
        ],
        env: {
          ...sharedEnv,
          CVENGINE_SYSTEM_RELEASE_DIR: outputDir,
        },
        // Exit 2 means the evaluator was able to execute but release remains
        // blocked. We inspect the receipt below and accept only the explicit
        // characterization-policy blockers.
        acceptedExitCodes: [0, 2],
      });
      await record({ ...step, evidenceDir: outputDir });
      assertStep(step, [0, 2]);

      const evaluationPath = resolve(outputDir, 'release-gate-evaluation.json');
      const evaluation = await readJson(evaluationPath);
      const blockers = Array.isArray(evaluation.blockingCriteria) ? evaluation.blockingCriteria : [];
      const expectedBlocked = evaluation.ready === false
        && sameStringSet(blockers, EXPECTED_POLICY_BLOCKERS);
      const fullyReady = evaluation.ready === true && blockers.length === 0;
      if (!expectedBlocked && !fullyReady) {
        throw new Error(`${personaRun.runId} release evaluation has unexpected blockers: ${blockers.join(', ') || 'none'}.`);
      }
      releaseEvaluations.push({
        runId: personaRun.runId,
        evaluationPath,
        ready: evaluation.ready,
        blockingCriteria: blockers,
        runtimeFingerprint: evaluation.runtimeFingerprint,
      });
    }

    const runtimeFingerprints = [...new Set(releaseEvaluations.map((item) => item.runtimeFingerprint).filter(Boolean))];
    if (runtimeFingerprints.length !== 1) {
      throw new Error(`Repeated characterization produced ${runtimeFingerprints.length} distinct runtime fingerprints.`);
    }

    const everyReady = releaseEvaluations.every((item) => item.ready === true);
    const everyExpectedBlocked = releaseEvaluations.every((item) =>
      item.ready === false && sameStringSet(item.blockingCriteria, EXPECTED_POLICY_BLOCKERS),
    );
    if (!everyReady && !everyExpectedBlocked) {
      throw new Error('Repeated runs disagree on release-evaluation state.');
    }

    manifest.completedAt = new Date().toISOString();
    manifest.executionStatus = 'EVIDENCE_CAPTURED';
    manifest.releaseStatus = everyReady ? 'PASS' : 'BLOCKED_PENDING_INTERPRETATION';
    manifest.runtimeEnvelopeStatus = everyReady ? 'PASS' : 'UNCHARACTERIZED';
    manifest.latencyBudgetStatus = everyReady ? 'PASS' : 'UNCHARACTERIZED';
    manifest.runtimeFingerprint = runtimeFingerprints[0];
    manifest.releaseEvaluations = releaseEvaluations;
    manifest.note = everyReady
      ? 'All current release criteria passed. This runner does not itself define a support envelope; use the evaluator policy that produced the PASS.'
      : 'All executed evidence gates passed; release remains blocked only because runtime envelope and latency budgets have not been approved from the observations.';
    await persistJson(manifestPath, manifest);

    process.stdout.write(`\nATS-SYS-02 reference execution: ${manifest.executionStatus}\n`);
    process.stdout.write(`Release: ${manifest.releaseStatus}\n`);
    process.stdout.write(`Evidence: ${root}\n`);
  } catch (error) {
    manifest.completedAt = new Date().toISOString();
    manifest.executionStatus = 'FAILED';
    manifest.releaseStatus = 'BLOCKED';
    manifest.blockingReason = error instanceof Error ? error.message : String(error);
    await persistJson(manifestPath, manifest);
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
