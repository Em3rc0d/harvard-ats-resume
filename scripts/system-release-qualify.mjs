import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const REQUIRED_CRITERIA = [
  'canonical-personas',
  'failure-degradation',
  'runtime-identity-evidence',
  'runtime-envelope',
  'truth-invariants',
  'durable-readback',
  'latency-budgets',
  'build-identity',
  'docker-cold-start',
];
const POLICY_BLOCKERS = ['latency-budgets', 'runtime-envelope'];

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function sameStringSet(actual, expected) {
  const a = [...new Set(actual)].sort();
  const b = [...new Set(expected)].sort();
  return JSON.stringify(a) === JSON.stringify(b);
}

function criterion(status, evidenceRefs, detail) {
  return { status, evidenceRefs, detail };
}

async function main() {
  const evaluationValue = argValue('--evaluation');
  const interpretationValue = argValue('--interpretation');
  if (!evaluationValue || !interpretationValue) {
    throw new Error('Usage: node scripts/system-release-qualify.mjs --evaluation <release-gate-evaluation.json> --interpretation <reference-interpretation.json>');
  }

  const evaluationPath = resolve(evaluationValue);
  const interpretationPath = resolve(interpretationValue);
  const evaluation = await readJson(evaluationPath);
  const interpretation = await readJson(interpretationPath);

  if (evaluation.evaluationVersion !== 'ats-sys-02-release-evaluation-v0.2') {
    throw new Error(`Unsupported release evaluation version: ${evaluation.evaluationVersion ?? 'UNKNOWN'}.`);
  }
  if (interpretation.interpretationVersion !== 'ats-sys-02-reference-interpretation-v0.1') {
    throw new Error(`Unsupported interpretation version: ${interpretation.interpretationVersion ?? 'UNKNOWN'}.`);
  }
  if (evaluation.ready !== false || !sameStringSet(evaluation.blockingCriteria || [], POLICY_BLOCKERS)) {
    throw new Error(`Pre-interpretation evaluation must be blocked only by ${POLICY_BLOCKERS.join(', ')}.`);
  }
  if (interpretation.qualifiesForReleaseEvaluation !== true) {
    throw new Error('Reference interpretation did not qualify for final release evaluation.');
  }
  if (evaluation.runtimeFingerprint !== interpretation.runtimeFingerprint) {
    throw new Error('Interpretation runtime fingerprint does not match the release-evaluation runtime fingerprint.');
  }

  const criteria = { ...evaluation.criteria };
  criteria['runtime-envelope'] = interpretation.runtimeEnvelope?.status === 'PASS'
    ? criterion(
        'PASS',
        interpretation.runtimeEnvelope.evidenceRefs || [],
        interpretation.runtimeEnvelope.detail || 'Exact observed runtime envelope satisfied the approved policy.',
      )
    : criterion(
        'FAIL',
        interpretation.runtimeEnvelope?.evidenceRefs || [],
        interpretation.runtimeEnvelope?.detail || 'Runtime envelope interpretation failed.',
      );
  criteria['latency-budgets'] = interpretation.latencyBudgets?.status === 'PASS'
    ? criterion(
        'PASS',
        interpretation.latencyBudgets.evidenceRefs || [],
        interpretation.latencyBudgets.detail || 'Observed workloads satisfied the approved latency policy.',
      )
    : criterion(
        'FAIL',
        interpretation.latencyBudgets?.evidenceRefs || [],
        interpretation.latencyBudgets?.detail || 'Latency budget interpretation failed.',
      );

  const blockingCriteria = REQUIRED_CRITERIA.filter((criterionId) => {
    const value = criteria[criterionId];
    return value?.status !== 'PASS' || !Array.isArray(value.evidenceRefs) || value.evidenceRefs.length === 0;
  });

  const qualification = {
    qualificationVersion: 'ats-sys-02-release-qualification-v0.1',
    qualifiedAt: new Date().toISOString(),
    sourceEvaluationRef: evaluationPath,
    interpretationRef: interpretationPath,
    policyVersion: interpretation.policyVersion,
    buildSha: interpretation.buildSha,
    runtimeProfileId: interpretation.runtimeProfileId,
    runtimeFingerprint: interpretation.runtimeFingerprint,
    criteria,
    ready: blockingCriteria.length === 0,
    blockingCriteria,
    scope: interpretation.runtimeEnvelope?.supportScope,
    caveats: interpretation.runtimeEnvelope?.uncharacterizedClaims || [],
    policy: 'Final qualification never upgrades missing or failed pre-interpretation evidence. It may resolve only the two explicit policy blockers using a release-policy interpretation bound to the same runtime fingerprint.',
  };

  const outputDir = resolve(process.env.CVENGINE_SYSTEM_QUALIFICATION_DIR || 'evidence/ats-sys-02/release-qualification');
  await mkdir(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, 'release-qualification.json');
  await writeFile(outputPath, `${JSON.stringify(qualification, null, 2)}\n`, 'utf8');
  process.stdout.write(`${qualification.ready ? 'RELEASE QUALIFIED' : 'RELEASE BLOCKED'}\n`);
  process.stdout.write(`Blocking criteria: ${blockingCriteria.join(', ') || 'none'}\n`);
  process.stdout.write(`Qualification: ${outputPath}\n`);
  if (!qualification.ready) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
