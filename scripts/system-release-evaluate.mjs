import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const REQUIRED_PERSONAS = ['P01', 'P03', 'P04', 'P09'];
const REQUIRED_CRITERIA = [
  'canonical-personas',
  'failure-degradation',
  'runtime-envelope',
  'truth-invariants',
  'durable-readback',
  'latency-budgets',
  'build-identity',
  'docker-cold-start',
];
const EXPECTED_GENERATION = {
  provider: 'cv-engine-deterministic',
  model: 'source-preserving-resume-composer-v2',
  contractVersion: 'ats2-evidence-bound-resume-v2',
};

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isoSafe(value) {
  return value.replace(/[:.]/g, '-');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function persistJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function criterion(status, evidenceRefs, detail) {
  return { status, evidenceRefs, detail };
}

function passStages(receipt, stageIds) {
  return stageIds.every((stageId) => {
    const stage = receipt?.stages?.[stageId];
    return stage?.status === 'PASS' && Array.isArray(stage.evidenceRefs) && stage.evidenceRefs.length > 0;
  });
}

function sameGenerationMetadata(actual) {
  return actual?.provider === EXPECTED_GENERATION.provider
    && actual?.model === EXPECTED_GENERATION.model
    && actual?.contractVersion === EXPECTED_GENERATION.contractVersion;
}

async function main() {
  const personaRun = argValue('--persona-run');
  const faultRun = argValue('--fault-run');
  const coldStartPath = argValue('--cold-start');
  if (!personaRun || !faultRun) {
    throw new Error('Usage: npm run system:release-evaluate -- --persona-run <dir> --fault-run <dir> [--cold-start <cold-start-receipt.json>]');
  }

  const personaRoot = resolve(personaRun);
  const faultRoot = resolve(faultRun);
  const receipts = {};
  const generationEvaluations = {};
  for (const personaId of REQUIRED_PERSONAS) {
    receipts[personaId] = await readJson(resolve(personaRoot, personaId, 'receipt.json'));
    generationEvaluations[personaId] = await readJson(resolve(personaRoot, personaId, '05-final-resume-truth-evaluation.json'));
  }
  const faultSummary = await readJson(resolve(faultRoot, 'summary.json'));

  const evidenceRefs = {
    personas: REQUIRED_PERSONAS.map((personaId) => resolve(personaRoot, personaId, 'receipt.json')),
    generation: REQUIRED_PERSONAS.map((personaId) => resolve(personaRoot, personaId, '05-final-resume-truth-evaluation.json')),
    faults: [resolve(faultRoot, 'summary.json')],
  };

  const criteria = {};
  const personaAccepted = REQUIRED_PERSONAS.every((personaId) => receipts[personaId]?.accepted === true);
  criteria['canonical-personas'] = personaAccepted
    ? criterion('PASS', evidenceRefs.personas, 'All promoted v0.1 canonical personas emitted accepted receipts.')
    : criterion('FAIL', evidenceRefs.personas, 'At least one promoted persona is missing or not accepted.');

  const faultReceipts = Array.isArray(faultSummary.receipts) ? faultSummary.receipts : [];
  const requiredFaultIds = ['local-ai-down', 'durable-redis-down'];
  const faultPass = requiredFaultIds.every((scenarioId) =>
    faultReceipts.some((receipt) => receipt.scenarioId === scenarioId && receipt.result === 'PASS'),
  );
  criteria['failure-degradation'] = faultPass
    ? criterion('PASS', evidenceRefs.faults, 'P10 fault scenarios matched the degradation contract.')
    : criterion('FAIL', evidenceRefs.faults, 'P10 fault evidence is incomplete or contradicted the degradation contract.');

  const truthStages = ['careerEvidence', 'resumeAssembly', 'grounding', 'semanticGrounding', 'provenance'];
  const truthStagePass = REQUIRED_PERSONAS.every((personaId) => passStages(receipts[personaId], truthStages));
  const operationalProvenancePass = REQUIRED_PERSONAS.every((personaId) =>
    sameGenerationMetadata(generationEvaluations[personaId]?.generation),
  );
  const truthPass = truthStagePass && operationalProvenancePass;
  criteria['truth-invariants'] = truthPass
    ? criterion(
        'PASS',
        [...evidenceRefs.personas, ...evidenceRefs.generation],
        'Known-truth, JD-isolation, grounding, claim provenance and deterministic generation provenance passed for every promoted persona.',
      )
    : criterion(
        'FAIL',
        [...evidenceRefs.personas, ...evidenceRefs.generation],
        operationalProvenancePass
          ? 'One or more truth/provenance stages failed.'
          : `ResumeVersion generation metadata must equal ${JSON.stringify(EXPECTED_GENERATION)} for every promoted persona.`,
      );

  const durabilityPass = REQUIRED_PERSONAS.every((personaId) => passStages(receipts[personaId], ['persistence', 'readBack']));
  criteria['durable-readback'] = durabilityPass
    ? criterion('PASS', evidenceRefs.personas, 'Every promoted persona persisted and survived direct Career Vault read-back.')
    : criterion('FAIL', evidenceRefs.personas, 'One or more promoted personas lack persistence/read-back evidence.');

  const identities = REQUIRED_PERSONAS.map((personaId) => receipts[personaId]?.identity);
  const buildShas = new Set(identities.map((identity) => identity?.buildSha).filter(Boolean));
  const profiles = new Set(identities.map((identity) => identity?.runtimeProfileId).filter(Boolean));
  const identityPass = identities.every((identity) => identity?.releaseQualifiableIdentity === true)
    && buildShas.size === 1
    && profiles.size === 1;
  criteria['build-identity'] = identityPass
    ? criterion('PASS', evidenceRefs.personas, `All persona receipts identify build ${[...buildShas][0]} on profile ${[...profiles][0]}.`)
    : criterion('FAIL', evidenceRefs.personas, 'Persona receipts do not share one release-qualifiable build/runtime identity.');

  criteria['runtime-envelope'] = criterion(
    'UNCHARACTERIZED',
    [],
    'Observed measurements exist, but no minimum supported runtime has been approved from repeated characterization data.',
  );
  criteria['latency-budgets'] = criterion(
    'UNCHARACTERIZED',
    [],
    'Latency is measured but no product budgets are approved yet. Observation is not a budget.',
  );

  if (coldStartPath) {
    const resolvedColdStart = resolve(coldStartPath);
    const coldStart = await readJson(resolvedColdStart);
    const personaBuildSha = buildShas.size === 1 ? [...buildShas][0] : undefined;
    const personaProfile = profiles.size === 1 ? [...profiles][0] : undefined;
    const attempts = Array.isArray(coldStart.attempts) ? coldStart.attempts : [];
    const coldStartPass = coldStart.result === 'PASS'
      && coldStart.semantics === 'CONTAINERS_COLD_VOLUMES_RETAINED'
      && coldStart.destructiveVolumeReset === false
      && coldStart.repetitions >= 3
      && attempts.length === coldStart.repetitions
      && attempts.every((attempt) => attempt.result === 'PASS')
      && (!personaBuildSha || coldStart.expectedBuildSha === personaBuildSha)
      && (!personaProfile || coldStart.runtimeProfileId === personaProfile);
    criteria['docker-cold-start'] = coldStartPass
      ? criterion('PASS', [resolvedColdStart], `${coldStart.repetitions} identified container-cold starts passed with volumes retained.`)
      : criterion('FAIL', [resolvedColdStart], 'Cold-start receipt does not satisfy the v0.1 reproducibility/identity contract.');
  } else {
    criteria['docker-cold-start'] = criterion(
      'UNCHARACTERIZED',
      [],
      'A dedicated identified cold-start receipt has not been supplied to this evaluator.',
    );
  }

  const missing = REQUIRED_CRITERIA.filter((criterionId) => {
    const value = criteria[criterionId];
    return value?.status !== 'PASS' || !Array.isArray(value.evidenceRefs) || value.evidenceRefs.length === 0;
  });

  const measurements = REQUIRED_PERSONAS.map((personaId) => ({
    personaId,
    totalLatencyMs: receipts[personaId]?.measurements?.totalLatencyMs,
    peakMemoryMiB: receipts[personaId]?.measurements?.peakMemoryMiB,
    aiCalls: receipts[personaId]?.aiCalls,
    generation: generationEvaluations[personaId]?.generation,
  }));

  const evaluation = {
    evaluationVersion: 'ats-sys-01-release-evaluation-v0.1',
    evaluatedAt: new Date().toISOString(),
    personaRun: personaRoot,
    faultRun: faultRoot,
    coldStartReceipt: coldStartPath ? resolve(coldStartPath) : undefined,
    criteria,
    measurements,
    ready: missing.length === 0,
    blockingCriteria: missing,
    policy: 'PASS requires explicit evidence. UNCHARACTERIZED never counts as PASS.',
  };

  const outputDir = resolve(process.env.CVENGINE_SYSTEM_RELEASE_DIR || `evidence/system/release/${isoSafe(new Date().toISOString())}`);
  await mkdir(outputDir, { recursive: true });
  await persistJson(resolve(outputDir, 'release-gate-evaluation.json'), evaluation);
  process.stdout.write(`${evaluation.ready ? 'RELEASE PASS' : 'RELEASE BLOCKED'}\n`);
  process.stdout.write(`Blocking criteria: ${missing.join(', ') || 'none'}\n`);
  process.stdout.write(`Evidence: ${outputDir}\n`);
  if (!evaluation.ready) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
