import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

test('ATS-SYS-03E keeps real resumes and PII-bearing ground truth outside Git', () => {
  const harness = read('scripts/system-real-world-corpus.mjs');
  const inventory = read('scripts/system-real-world-corpus-inventory.mjs');
  const docs = read('docs/system/ATS-SYS-03E-REAL-WORLD-CORPUS.md');

  assert.match(harness, /manifest must live outside the repository/);
  assert.match(harness, /must live outside the repository/);
  assert.match(inventory, /private corpus directory must live outside the repository/);
  assert.match(docs, /Real resumes and their PII-bearing ground-truth manifests must live outside the repository/);
  assert.match(docs, /RAW CV \/ PII != GIT ARTIFACT/);
});

test('ATS-SYS-03E pins every source by sha256 and rejects source drift', () => {
  const harness = read('scripts/system-real-world-corpus.mjs');
  const inventory = read('scripts/system-real-world-corpus-inventory.mjs');

  assert.match(harness, /sha256 must pin the exact source document/);
  assert.match(harness, /sha256 mismatch; source changed after ground truth was authored/);
  assert.match(inventory, /createHash\('sha256'\)/);
  assert.match(inventory, /ats-sys-03e-manifest\.inventory\.json/);
});

test('ATS-SYS-03E receipt excludes raw PII-bearing truth, source paths, and named identifiers', () => {
  const harness = read('scripts/system-real-world-corpus.mjs');
  const inventory = read('scripts/system-real-world-corpus-inventory.mjs');

  assert.match(harness, /rawDocumentsPersistedInEvidence: false/);
  assert.match(harness, /groundTruthStringsPersistedInEvidence: false/);
  assert.match(harness, /sourcePathsPersistedInEvidence: false/);
  assert.match(harness, /const OPAQUE_CORPUS_ID = \/\^CORPUS-/);
  assert.match(harness, /const OPAQUE_DOCUMENT_ID = \/\^RW-/);
  assert.match(harness, /PII are forbidden in evidence identifiers/);
  assert.match(harness, /documentIdentity: 'opaque RW-### id \+ sha256 only'/);
  assert.match(inventory, /corpusId: `CORPUS-\$\{compactDate\}`/);
  assert.match(inventory, /id: `RW-\$\{String\(index \+ 1\)\.padStart\(3, '0'\)\}`/);
  assert.match(harness, /truthIssueKinds/);
  assert.doesNotMatch(harness, /expectedTruth:\s*document\.expectedTruth/);
});

test('ATS-SYS-03E distinguishes truth corruption from safe robustness failure', () => {
  const harness = read('scripts/system-real-world-corpus.mjs');

  assert.match(harness, /SUCCESS_TRUTH_SAFE/);
  assert.match(harness, /SAFE_REFUSAL_EXPECTED/);
  assert.match(harness, /ROBUSTNESS_FAILURE_SAFE/);
  assert.match(harness, /ROBUSTNESS_FAILURE_UNEXPECTED_ACCEPTANCE/);
  assert.match(harness, /acceptedStructuralTruthMismatches/);
  assert.match(harness, /acceptedIncompleteTruth/);
  assert.match(harness, /unsupportedTruthAccepted/);
  assert.match(harness, /UNSAFE_FAILURE_WITH_ACCEPTED_DATA/);
  assert.match(harness, /unsafeAcceptedTruth/);
  assert.match(harness, /expectedPasses === requests\.length/);
});

test('ATS-SYS-03E preserves the public rate limiter and caps a single cohort below the current window', () => {
  const harness = read('scripts/system-real-world-corpus.mjs');
  const reference = read('scripts/system-real-world-corpus-reference.mjs');

  assert.match(harness, /const MAX_DOCUMENTS_PER_RUN = 40/);
  assert.match(harness, /existing 50-request\/hour limiter remains enabled/);
  assert.match(harness, /CONTROL_PLANE_RATE_LIMIT/);
  assert.match(reference, /@upstash\/ratelimit\*/);
  assert.match(reference, /rateLimitWindowReset = 'PASS'/);
});

test('ATS-SYS-03E reference runner owns the same isolated identified runtime topology', () => {
  const reference = read('scripts/system-real-world-corpus-reference.mjs');

  assert.match(reference, /const COMPOSE_PROJECT = 'cv-engine-reference'/);
  assert.match(reference, /const APP_PORT = '3100'/);
  assert.match(reference, /const OLLAMA_PORT = '31434'/);
  assert.match(reference, /const REDIS_HTTP_PORT = '38079'/);
  assert.match(reference, /CVENGINE_RUNTIME_PROFILE_ID: REQUIRED_PROFILE/);
  assert.match(reference, /CV_ENGINE_E2E_BASE_URL: BASE_URL/);
  assert.match(reference, /docker-compose-identified\.mjs', 'build', 'app'/);
  assert.match(reference, /releaseQualifiableIdentity === true/);
  assert.match(reference, /body\?\.identity\?\.buildSha === expectedBuildSha/);
});

test('ATS-SYS-03E keeps synthetic stress documents separate from real-world evidence', () => {
  const harness = read('scripts/system-real-world-corpus.mjs');
  const docs = read('docs/system/ATS-SYS-03E-REAL-WORLD-CORPUS.md');

  assert.match(harness, /REAL_USER_PROVIDED/);
  assert.match(harness, /PUBLIC_SANITIZED/);
  assert.match(harness, /SYNTHETIC_STRESS/);
  assert.match(harness, /REAL_USER_PROVIDED and PUBLIC_SANITIZED documents are real-world evidence; SYNTHETIC_STRESS documents remain synthetic/);
  assert.match(docs, /Only `REAL_USER_PROVIDED` and `PUBLIC_SANITIZED` contribute real-world evidence/);
});

test('ATS-SYS-03E review oracle is source-only and never uses model/import output', () => {
  const review = read('scripts/system-real-world-corpus-review.mjs');

  assert.match(review, /oraclePolicy: 'HUMAN_AUTHORED_FROM_SOURCE_ONLY'/);
  assert.match(review, /modelUsed: false/);
  assert.match(review, /importApiUsed: false/);
  assert.match(review, /ground-truth\.template\.json/);
  assert.match(review, /source\.txt/);
  assert.doesNotMatch(review, /api\/import-resume/);
  assert.doesNotMatch(review, /OllamaStructuredClient/);
});

test('ATS-SYS-03E finalizer refuses incomplete or source-inconsistent ground truth', () => {
  const finalizer = read('scripts/system-real-world-corpus-finalize.mjs');

  assert.match(finalizer, /cannot remain REVIEW_REQUIRED/);
  assert.match(finalizer, /requiredStrings contains a value not present in source\.txt/);
  assert.match(finalizer, /forbiddenStrings contains a value that is actually present in source\.txt/);
  assert.match(finalizer, /template\/source sha256 does not match inventory/);
  assert.match(finalizer, /HUMAN_AUTHORED_FROM_SOURCE_ONLY/);
  assert.match(finalizer, /READY_FOR_EVIDENCE_CAMPAIGN/);
  assert.doesNotMatch(finalizer, /api\/import-resume/);
  assert.doesNotMatch(finalizer, /Ollama/);
});
