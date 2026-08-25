import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

test('ATS-SYS-03D uses P01 as a truth-known model-forced import fixture', () => {
  const harness = source('scripts/system-import-model-capacity.mjs');
  const provider = source('lib/infrastructure/import/OllamaResumeImportV3Provider.ts');

  assert.match(harness, /MODEL_FORCED_PERSONA = 'P01'/);
  assert.match(harness, /\/api\/import-resume/);
  assert.match(harness, /canonical-personas\.v0\.1\.json/);
  assert.match(harness, /validateImportedTruth/);
  assert.match(harness, /expectedOllamaChatCallsPerImport:\s*1/);

  assert.match(provider, /const TECHNICAL_SKILL_HEADINGS = new Set\(\[/);
  assert.doesNotMatch(
    provider.match(/const TECHNICAL_SKILL_HEADINGS = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? '',
    /['"]SKILLS['"]/,
  );
  assert.match(provider, /sourceExactSkills \?\? await generateSection\(\{/);
  assert.match(provider, /label: 'skills'/);
});

test('ATS-SYS-03D measures real Ollama chat calls from the isolated container', () => {
  const harness = source('scripts/system-import-model-capacity.mjs');

  assert.match(harness, /docker/);
  assert.match(harness, /compose/);
  assert.match(harness, /logs/);
  assert.match(harness, /--no-color/);
  assert.match(harness, /ollama/);
  assert.match(harness, /\/api\/chat/);
  assert.match(harness, /ollamaChatCalls === concurrency/);
  assert.match(harness, /expectedChatCalls:\s*concurrency/);
  assert.match(harness, /model trace mismatch/i);
});

test('ATS-SYS-03D preserves truth safety and rate-limit boundaries under model pressure', () => {
  const harness = source('scripts/system-import-model-capacity.mjs');

  assert.match(harness, /UNSAFE_SUCCESS/);
  assert.match(harness, /UNSAFE_FAILURE_WITH_ACCEPTED_DATA/);
  assert.match(harness, /unsafeAcceptedTruth/);
  assert.match(harness, /RESUME_IMPORT_RATE_LIMITED/);
  assert.match(harness, /CONTROL_PLANE_RATE_LIMIT/);
  assert.match(harness, /confounded by API rate limiting/i);
  assert.match(harness, /SAFE_FAILURE_CODES/);
  assert.match(harness, /RESUME_IMPORT_TIMEOUT/);
});

test('ATS-SYS-03D runs bounded model-backed concurrency, saturation, and same-build recovery', () => {
  const harness = source('scripts/system-import-model-capacity.mjs');

  assert.match(harness, /DEFAULT_LEVELS = \[1, 2, 4, 8\]/);
  assert.match(harness, /DEFAULT_SATURATION_CONCURRENCY = 16/);
  assert.match(harness, /maxZeroFailureConcurrency/);
  assert.match(harness, /model-recovery-c1/);
  assert.match(harness, /health\(expectedBuildSha\)/);
  assert.match(harness, /recoveryRequest\.classification === 'SUCCESS_TRUTH_SAFE'/);
  assert.match(harness, /totalOllamaChatCalls === expectedOllamaChatCalls/);
});

test('ATS-SYS-03D explicitly refuses to generalize one AI-backed section into arbitrary CV capacity', () => {
  const harness = source('scripts/system-import-model-capacity.mjs');
  const docs = source('docs/system/ATS-SYS-03D-MODEL-FORCED-CAPACITY.md');

  assert.match(harness, /does not characterize resumes that require multiple AI-backed sections per document/i);
  assert.match(docs, /one model-backed section per import/i);
  assert.match(docs, /not a production concurrency SLA/i);
  assert.match(docs, /does not prove multi-section AI-heavy CV capacity/i);
});

test('ATS-SYS-03D reference runner owns the same isolated identified runtime', () => {
  const runner = source('scripts/system-import-model-capacity-reference.mjs');

  assert.match(runner, /REFERENCE-CPU-01/);
  assert.match(runner, /COMPOSE_PROJECT = 'cv-engine-reference'/);
  assert.match(runner, /APP_PORT = '3100'/);
  assert.match(runner, /OLLAMA_PORT = '31434'/);
  assert.match(runner, /REDIS_HTTP_PORT = '38079'/);
  assert.match(runner, /\['compose', 'down'\]/);
  assert.doesNotMatch(runner, /down[^\n]*-v/);
  assert.match(runner, /docker-compose-identified\.mjs/);
  assert.match(runner, /waitForReady/);
  assert.match(runner, /system-import-model-capacity\.mjs/);
  assert.match(runner, /rateLimitWindowReset/);
});

test('ATS-SYS-03D exposes raw and isolated reference commands', () => {
  const packageJson = JSON.parse(source('package.json')) as { scripts?: Record<string, string> };
  assert.equal(
    packageJson.scripts?.['system:import-model-capacity'],
    'node scripts/system-import-model-capacity.mjs',
  );
  assert.equal(
    packageJson.scripts?.['system:import-model-capacity:reference'],
    'node scripts/system-import-model-capacity-reference.mjs',
  );
});
