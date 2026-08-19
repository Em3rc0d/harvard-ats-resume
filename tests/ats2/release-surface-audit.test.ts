import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('the public page routes through one audited flow instead of the legacy dual-generation surface', () => {
  const page = source('app/page.tsx');
  assert.match(page, /CVEngineFlow/);
  assert.doesNotMatch(page, /ResumeForm|CAREER_VAULT_STORAGE_KEY|getOrCreateCareerVaultId/);
});

test('career evidence editing cannot generate directly or render a Job Description input', () => {
  const flow = source('components/CVEngineFlow.tsx');
  const editor = source('components/CareerEvidenceForm.tsx');

  assert.match(flow, /CareerEvidenceForm/);
  assert.match(flow, /TargetJobStep/);
  assert.match(flow, /setStage\('TARGET'\)/);
  assert.match(flow, /\/api\/generate-resume/);

  assert.doesNotMatch(editor, /\/api\/generate-resume/);
  assert.doesNotMatch(editor, /jobDescription[^\n]{0,120}(?:textarea|input)|(?:textarea|input)[^\n]{0,120}jobDescription/);
  assert.doesNotMatch(editor, /console\.error|alert\s*\(/);
  assert.match(editor, /evaluateGenerationReadiness/);
});

test('resume upload presents expected import failures inline rather than throwing them into the Next dev overlay', () => {
  const upload = source('components/CVUpload.tsx');
  const route = source('app/api/import-resume/route.ts');

  assert.doesNotMatch(upload, /console\.error/);
  assert.doesNotMatch(upload, /throw new Error\(result\.error/);
  assert.match(upload, /errorCode/);
  assert.match(upload, /stage/);
  assert.match(upload, /MAX_FILE_BYTES/);
  assert.match(upload, /role="alert"/);

  assert.match(route, /classifyImportFailure/);
  assert.match(route, /NO_SOURCE_BACKED_CANDIDATE_CONTENT/);
  assert.match(route, /SOURCE_RECONCILIATION_REJECTED/);
  assert.match(route, /RESUME_IMPORT_RUNTIME_FAILURE/);
  assert.match(route, /errorCode: failure\.errorCode/);
  assert.match(route, /stage: failure\.stage/);
});

test('certificate quick fill keeps missing extraction fields empty and contains rejected promises', () => {
  const upload = source('components/CertificateUpload.tsx');

  assert.doesNotMatch(upload, /degree:\s*degree\s*\|\||institution:\s*institution\s*\|\||graduationDate:\s*graduationDate\s*\|\|/);
  assert.doesNotMatch(upload, /console\.error|throw err|pdfjs-dist|GlobalWorkerOptions/);
  assert.match(upload, /return \{\s*degree,\s*institution,\s*graduationDate,/);
  assert.match(upload, /\.catch\(\(caught\) => setError/);
  assert.match(upload, /\/api\/extract-certificate-text/);
});

test('generation failure recovery preserves the attempted target and exposes a target/retry path', () => {
  const flow = source('components/CVEngineFlow.tsx');

  assert.match(flow, /setResumeData\(data\)/);
  assert.match(flow, /Back to target|Volver al target/);
  assert.match(flow, /Retry trusted generation|Reintentar generación confiable/);
  assert.doesNotMatch(flow, /console\.error\('Error generating resume/);
});

test('results export, print and reset controls are explicit and expected PDF failures stay inline', () => {
  const results = source('components/ResumeResults.tsx');

  assert.match(results, /const \[downloadError, setDownloadError\]/);
  assert.match(results, /setDownloadError\(copy\.downloadError\)/);
  assert.match(results, /window\.print\(\)/);
  assert.match(results, /onClick=\{onStartOver\}/);
  assert.match(results, /safeFileName\(userName\)/);
  assert.doesNotMatch(results, /alert\s*\(/);
  assert.doesNotMatch(results, /console\.error/);
});
