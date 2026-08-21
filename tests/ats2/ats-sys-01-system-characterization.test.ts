import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAPABILITY_CONTRACTS,
  FAILURE_CLASS_CONTRACTS,
  REFERENCE_RUNTIME,
  RELEASE_GATE_CRITERIA,
  SYSTEM_INCIDENTS,
  evaluateReleaseGate,
  type ReleaseCriterionResult,
} from '../../lib/application/system/SystemCharacterizationContract';

test('ATS-SYS-01 never assigns truth authority to a model', () => {
  const modelAuthority = CAPABILITY_CONTRACTS.filter((capability) =>
    capability.truthAuthority.toLowerCase().includes('model'),
  );
  assert.deepEqual(modelAuthority, []);
});

test('ATS-SYS-01 keeps final resume assembly off the AI critical path', () => {
  const assembly = CAPABILITY_CONTRACTS.find((capability) => capability.id === 'resume-assembly');
  assert.ok(assembly);
  assert.equal(assembly.aiDependency, 'NONE');
  assert.equal(assembly.criticalPath, true);
  assert.match(assembly.failurePolicy, /determin/i);
  assert.match(assembly.failurePolicy, /model availability must not block/i);
});

test('ATS-SYS-01 optional AI failure preserves the product flow', () => {
  const optimize = CAPABILITY_CONTRACTS.find((capability) => capability.id === 'inline-optimize');
  assert.ok(optimize);
  assert.equal(optimize.aiDependency, 'OPTIONAL_ENHANCEMENT');
  assert.equal(optimize.criticalPath, false);
  assert.match(optimize.failurePolicy, /preserve the original/i);
  assert.match(optimize.failurePolicy, /continue/i);
});

test('ATS-SYS-01 failure taxonomy is complete and operational', () => {
  const expectedClasses = [
    'INPUT',
    'EXTRACTION',
    'MODEL',
    'PERFORMANCE',
    'CONFIGURATION',
    'PERSISTENCE',
    'TRUTH',
    'GROUNDING',
    'PROVENANCE',
    'DURABILITY',
    'VERSION_SKEW',
    'UI_STATE',
  ];

  assert.deepEqual(FAILURE_CLASS_CONTRACTS.map((failure) => failure.id), expectedClasses);
  for (const failure of FAILURE_CLASS_CONTRACTS) {
    assert.ok(failure.detect.trim(), `${failure.id} must define detection`);
    assert.ok(failure.contain.trim(), `${failure.id} must define containment`);
    assert.ok(failure.degrade.trim(), `${failure.id} must define degradation`);
    assert.ok(failure.recover.trim(), `${failure.id} must define recovery`);
    assert.ok(failure.observe.trim(), `${failure.id} must define observability`);
    assert.ok(failure.test.trim(), `${failure.id} must define a test strategy`);
  }
});

test('ATS-SYS-01 does not silently promote the observed dogfood machine to minimum support', () => {
  assert.equal(REFERENCE_RUNTIME.status, 'OBSERVED');
  assert.equal(REFERENCE_RUNTIME.minimumSupportedRuntime, false);
  assert.equal(REFERENCE_RUNTIME.containerized, true);
});

test('ATS-SYS-01 preserves verified incidents and uncertainty separately', () => {
  const importIncident = SYSTEM_INCIDENTS.find((incident) => incident.id === 'ATS-SYS-INC-001');
  const generationIncident = SYSTEM_INCIDENTS.find((incident) => incident.id === 'ATS-SYS-INC-002');
  const skewIncident = SYSTEM_INCIDENTS.find((incident) => incident.id === 'ATS-SYS-INC-003');

  assert.equal(importIncident?.status, 'VERIFIED');
  assert.equal(importIncident?.failureClass, 'PERFORMANCE');
  assert.equal(generationIncident?.status, 'VERIFIED');
  assert.equal(generationIncident?.failureClass, 'PERFORMANCE');
  assert.equal(skewIncident?.status, 'SUSPECTED');
  assert.equal(skewIncident?.failureClass, 'VERSION_SKEW');
});

test('ATS-SYS-01 release gate fails closed when characterization evidence is missing', () => {
  const result = evaluateReleaseGate([]);
  assert.equal(result.ready, false);
  assert.deepEqual(result.missing, RELEASE_GATE_CRITERIA.map((criterion) => criterion.id));
});

test('ATS-SYS-01 release gate requires evidence references even for PASS statuses', () => {
  const emptyEvidenceResults: ReleaseCriterionResult[] = RELEASE_GATE_CRITERIA.map((criterion) => ({
    criterionId: criterion.id,
    status: 'PASS',
    evidenceRefs: [],
  }));

  const result = evaluateReleaseGate(emptyEvidenceResults);
  assert.equal(result.ready, false);
  assert.deepEqual(result.missing, RELEASE_GATE_CRITERIA.map((criterion) => criterion.id));
});

test('ATS-SYS-01 release gate passes only with complete evidence-backed criteria', () => {
  const results: ReleaseCriterionResult[] = RELEASE_GATE_CRITERIA.map((criterion) => ({
    criterionId: criterion.id,
    status: 'PASS',
    evidenceRefs: [`evidence/system/${criterion.id}.json`],
  }));

  const result = evaluateReleaseGate(results);
  assert.equal(result.ready, true);
  assert.deepEqual(result.missing, []);
});
