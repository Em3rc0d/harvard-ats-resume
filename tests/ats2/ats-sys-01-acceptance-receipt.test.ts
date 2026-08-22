import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CORE_ACCEPTANCE_STAGES,
  SYSTEM_ACCEPTANCE_RECEIPT_VERSION,
  evaluateAcceptanceReceipt,
  type StageReceipt,
  type SystemAcceptanceReceipt,
} from '../../lib/application/system/SystemAcceptanceReceipt';
import { resolveRuntimeIdentity } from '../../lib/application/system/RuntimeIdentity';

function passingStage(ref: string): StageReceipt {
  return { status: 'PASS', evidenceRefs: [ref], latencyMs: 1 };
}

function baseReceipt(): SystemAcceptanceReceipt {
  return {
    receiptVersion: SYSTEM_ACCEPTANCE_RECEIPT_VERSION,
    personaId: 'P01',
    identity: resolveRuntimeIdentity({
      CVENGINE_BUILD_SHA: 'test-sha',
      CVENGINE_RUNTIME_PROFILE_ID: 'REFERENCE-CPU-01',
    }),
    runtimeIdentityRef: 'evidence/ats-sys-02/runtime/REFERENCE-CPU-01/test-sha/runtime.json',
    startedAt: '2026-08-21T00:00:00.000Z',
    completedAt: '2026-08-21T00:00:01.000Z',
    stages: Object.fromEntries(
      CORE_ACCEPTANCE_STAGES.map((stageId) => [stageId, passingStage(`evidence/${stageId}.json`)]),
    ),
    aiCalls: { total: 0, criticalPath: 0, byCapability: {} },
    measurements: { totalLatencyMs: 1000 },
  };
}

test('ATS-SYS-01 acceptance receipt fails closed without runtime identity', () => {
  const receipt = {
    ...baseReceipt(),
    identity: resolveRuntimeIdentity({}),
  };

  const evaluation = evaluateAcceptanceReceipt(receipt);
  assert.equal(evaluation.accepted, false);
  assert.ok(evaluation.blockingReasons.includes('runtime-identity'));
});

test('ATS-SYS-02 acceptance receipt fails closed without canonical runtime identity evidence ref', () => {
  const receipt = {
    ...baseReceipt(),
    runtimeIdentityRef: '',
  };

  const evaluation = evaluateAcceptanceReceipt(receipt);
  assert.equal(evaluation.accepted, false);
  assert.ok(evaluation.blockingReasons.includes('runtime-identity-ref'));
});

test('ATS-SYS-01 acceptance receipt requires evidence for every required passing stage', () => {
  const receipt = baseReceipt();
  const stages = { ...receipt.stages, grounding: { status: 'PASS' as const, evidenceRefs: [] } };
  const evaluation = evaluateAcceptanceReceipt({ ...receipt, stages });

  assert.equal(evaluation.accepted, false);
  assert.ok(evaluation.blockingReasons.includes('stage:grounding:missing-evidence'));
});

test('ATS-SYS-01 acceptance receipt treats expected safe failures as explicit blocking stage results', () => {
  const receipt = baseReceipt();
  const stages = {
    ...receipt.stages,
    persistence: {
      status: 'FAIL' as const,
      evidenceRefs: ['evidence/persistence-failure.json'],
      failureClass: 'DURABILITY' as const,
    },
  };

  const evaluation = evaluateAcceptanceReceipt({ ...receipt, stages });
  assert.equal(evaluation.accepted, false);
  assert.ok(evaluation.blockingReasons.includes('stage:persistence:fail'));
});

test('ATS-SYS-02 acceptance receipt accepts only complete evidence-backed core paths with canonical runtime identity evidence', () => {
  const evaluation = evaluateAcceptanceReceipt(baseReceipt());
  assert.equal(evaluation.accepted, true);
  assert.deepEqual(evaluation.blockingReasons, []);
});