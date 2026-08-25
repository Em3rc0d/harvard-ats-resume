import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

test('ATS-SYS-03 capacity harness uses the real import API and truth-known canonical fixtures', () => {
  const harness = source('scripts/system-import-robustness-capacity.mjs');
  assert.match(harness, /\/api\/import-resume/);
  assert.match(harness, /canonical-personas\.v0\.1\.json/);
  assert.match(harness, /P01/);
  assert.match(harness, /P03/);
  assert.match(harness, /P04/);
  assert.match(harness, /P09/);
  assert.match(harness, /validateImportedTruth/);
  assert.match(harness, /requiredStrings/);
  assert.match(harness, /forbiddenStrings/);
  assert.match(harness, /UNSAFE_SUCCESS/);
  assert.match(harness, /UNSAFE_FAILURE_WITH_ACCEPTED_DATA/);
});

test('ATS-SYS-03 keeps rate limiting active and distinguishes control-plane limits from Ollama capacity', () => {
  const harness = source('scripts/system-import-robustness-capacity.mjs');
  const docs = source('docs/system/ATS-SYS-03-IMPORT-ROBUSTNESS-CAPACITY.md');
  assert.match(harness, /RESUME_IMPORT_RATE_LIMITED/);
  assert.match(harness, /CONTROL_PLANE_RATE_LIMIT/);
  assert.match(harness, /confounded by API rate limiting/i);
  assert.doesNotMatch(harness, /RATE_LIMIT_BACKEND/);
  assert.match(docs, /36 requests/);
  assert.match(docs, /50-request public API window/);
  assert.match(docs, /without disabling or bypassing rate limiting/i);
});

test('ATS-SYS-03 sweeps bounded concurrency, saturates, then requires same-build recovery', () => {
  const harness = source('scripts/system-import-robustness-capacity.mjs');
  assert.match(harness, /DEFAULT_LEVELS = \[1, 2, 4, 8\]/);
  assert.match(harness, /DEFAULT_SATURATION_CONCURRENCY = 16/);
  assert.match(harness, /maxZeroFailureConcurrency/);
  assert.match(harness, /recovery-P01/);
  assert.match(harness, /recoveryRequest\.classification === 'SUCCESS_TRUTH_SAFE'/);
  assert.match(harness, /releaseQualifiableIdentity/);
  assert.match(harness, /identity\?\.buildSha !== expectedBuildSha/);
});

test('ATS-SYS-03 never turns safe overload refusal into a truth success claim', () => {
  const harness = source('scripts/system-import-robustness-capacity.mjs');
  assert.match(harness, /SAFE_FAILURE_CODES/);
  assert.match(harness, /RESUME_IMPORT_TIMEOUT/);
  assert.match(harness, /RESUME_EXTRACTION_INCOMPLETE/);
  assert.match(harness, /acceptedCandidateTruth:\s*hasAcceptedData/);
  assert.match(harness, /unsafeAcceptedTruth/);
  assert.match(harness, /unsafe accepted truth under saturation/i);
  assert.match(harness, /EVIDENCE_CAPTURED/);
});

test('ATS-SYS-03 explicitly refuses to generalize four synthetic DOCX files into arbitrary CV support', () => {
  const harness = source('scripts/system-import-robustness-capacity.mjs');
  const docs = source('docs/system/ATS-SYS-03-IMPORT-ROBUSTNESS-CAPACITY.md');
  assert.match(harness, /INITIAL_SYNTHETIC_CORPUS_ONLY/);
  assert.match(harness, /Four synthetic DOCX fixtures are insufficient/);
  assert.match(docs, /synthetic DOCX seed corpus only/i);
  assert.match(docs, /does not prove arbitrary real-world resumes/i);
  assert.match(docs, /arbitrary CV robustness or a production concurrency SLA/i);
});

test('ATS-SYS-03 reference runner owns the qualified isolated runtime boundary', () => {
  const runner = source('scripts/system-import-capacity-reference.mjs');
  assert.match(runner, /REFERENCE-CPU-01/);
  assert.match(runner, /COMPOSE_PROJECT = 'cv-engine-reference'/);
  assert.match(runner, /APP_PORT = '3100'/);
  assert.match(runner, /OLLAMA_PORT = '31434'/);
  assert.match(runner, /REDIS_HTTP_PORT = '38079'/);
  assert.match(runner, /\['compose', 'down'\]/);
  assert.doesNotMatch(runner, /down[^\n]*-v/);
  assert.match(runner, /docker-compose-identified\.mjs/);
  assert.match(runner, /waitForReady/);
  assert.match(runner, /releaseQualifiableIdentity/);
  assert.match(runner, /system-import-robustness-capacity\.mjs/);
});

test('ATS-SYS-03 exposes raw and isolated-reference package commands', () => {
  const packageJson = JSON.parse(source('package.json')) as { scripts?: Record<string, string> };
  assert.equal(packageJson.scripts?.['system:import-capacity'], 'node scripts/system-import-robustness-capacity.mjs');
  assert.equal(packageJson.scripts?.['system:import-capacity:reference'], 'node scripts/system-import-capacity-reference.mjs');
});
