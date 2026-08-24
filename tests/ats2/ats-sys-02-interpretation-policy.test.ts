import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

test('ATS-SYS-02 v0.1 release policy is narrow, explicit, and does not infer lower hardware support', () => {
  const policy = JSON.parse(source('docs/system/ATS-SYS-02-RUNTIME-POLICY-v0.1.json')) as {
    policyVersion: string;
    status: string;
    supportScope: string;
    runtimeProfileId: string;
    minimumRepeatedRuns: Record<string, number>;
    latencyBudgets: Record<string, number>;
    capabilityPolicy: Record<string, unknown>;
    uncharacterizedClaims: string[];
  };

  assert.equal(policy.policyVersion, 'ats-sys-02-runtime-policy-v0.1');
  assert.equal(policy.status, 'APPROVED');
  assert.equal(policy.supportScope, 'EXACT_OBSERVED_RUNTIME_FINGERPRINT_ONLY');
  assert.equal(policy.runtimeProfileId, 'REFERENCE-CPU-01');
  assert.equal(policy.minimumRepeatedRuns.containerColdStart, 3);
  assert.equal(policy.minimumRepeatedRuns.canonicalPersonas, 3);
  assert.equal(policy.minimumRepeatedRuns.inlineOptimize, 3);
  assert.equal(policy.latencyBudgets.containerColdStartReadyMs, 45_000);
  assert.equal(policy.latencyBudgets.canonicalPersonaEndToEndMs, 90_000);
  assert.equal(policy.latencyBudgets.inlineOptimizeProductResponseMs, 20_000);
  assert.equal(policy.capabilityPolicy.inlineOptimizeAiCompletionRequired, false);
  assert.equal(policy.capabilityPolicy.inlineOptimizeSafeFallbackAccepted, true);
  assert.ok(policy.uncharacterizedClaims.some((claim) => /lower-spec hardware/i.test(claim)));
  assert.ok(policy.uncharacterizedClaims.some((claim) => /cross-host/i.test(claim)));
});

test('reference interpretation consumes repeated raw evidence instead of promoting observed values by label', () => {
  const interpreter = source('scripts/system-interpret-reference.mjs');
  assert.match(interpreter, /release-evaluations/);
  assert.match(interpreter, /runtime-observation\.json/);
  assert.match(interpreter, /cold-start-receipt\.json/);
  assert.match(interpreter, /inline-optimize-runs/);
  assert.match(interpreter, /persona-runs/);
  assert.match(interpreter, /EXACT_OBSERVED_RUNTIME_FINGERPRINT_ONLY/);
  assert.match(interpreter, /runtimeHostFingerprints\.size === 1/);
  assert.match(interpreter, /containerColdStartReadyMs/);
  assert.match(interpreter, /canonicalPersonaEndToEndMs/);
  assert.match(interpreter, /inlineOptimizeProductResponseMs/);
  assert.match(interpreter, /qualifiesForReleaseEvaluation/);
  assert.match(interpreter, /does not generalize the observed host/i);
});

test('final qualification can resolve only the two explicit policy blockers and preserves every other release criterion', () => {
  const qualifier = source('scripts/system-release-qualify.mjs');
  assert.match(qualifier, /POLICY_BLOCKERS = \['latency-budgets', 'runtime-envelope'\]/);
  assert.match(qualifier, /evaluation\.ready !== false/);
  assert.match(qualifier, /evaluation\.runtimeFingerprint !== interpretation\.runtimeFingerprint/);
  assert.match(qualifier, /criteria\['runtime-envelope'\]/);
  assert.match(qualifier, /criteria\['latency-budgets'\]/);
  assert.match(qualifier, /REQUIRED_CRITERIA\.filter/);
  assert.match(qualifier, /never upgrades missing or failed pre-interpretation evidence/i);
});

test('reference runner now performs evidence capture, interpretation, then exact-fingerprint qualification', () => {
  const runner = source('scripts/system-reference-run.mjs');
  const packageJson = JSON.parse(source('package.json')) as { scripts: Record<string, string> };

  assert.match(runner, /ats-sys-02-reference-run-v0\.2/);
  assert.match(runner, /system-interpret-reference\.mjs/);
  assert.match(runner, /system-release-qualify\.mjs/);
  assert.match(runner, /BLOCKED_PENDING_INTERPRETATION/);
  assert.match(runner, /BLOCKED_POLICY_VIOLATION/);
  assert.match(runner, /releaseStatus = 'QUALIFIED'/);
  assert.match(runner, /executionStatus = 'EVIDENCE_CAPTURED'/);
  assert.match(runner, /Lower-spec\/cross-host support remains explicitly uncharacterized/);
  assert.equal(packageJson.scripts['system:interpret-reference'], 'node scripts/system-interpret-reference.mjs');
  assert.equal(packageJson.scripts['system:release-qualify'], 'node scripts/system-release-qualify.mjs');
});

test('manual import timeout UI preserves the exact section returned by the trusted API boundary', () => {
  const upload = source('components/CVUpload.tsx');
  const route = source('app/api/import-resume/route.ts');
  assert.match(route, /section: failure\.section/);
  assert.match(upload, /section\?: string/);
  assert.match(upload, /section: result\.section/);
  assert.match(upload, /errorMeta\?\.section/);
  assert.match(upload, /processCopy\.section/);
});
