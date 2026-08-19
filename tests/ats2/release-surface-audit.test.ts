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

test('career evidence editing cannot generate directly or own Job Description truth', () => {
  const flow = source('components/CVEngineFlow.tsx');
  const editor = source('components/CareerEvidenceForm.tsx');

  assert.match(flow, /CareerEvidenceForm/);
  assert.match(flow, /TargetJobStep/);
  assert.match(flow, /setStage\('TARGET'\)/);
  assert.match(flow, /\/api\/generate-resume/);

  assert.doesNotMatch(editor, /\/api\/generate-resume/);
  assert.doesNotMatch(editor, /jobDesc|Job Description|Descripción del Trabajo|description du poste/i);
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

test('certificate quick fill never persists not-found placeholders or leaks rejected promises', () => {
  const upload = source('components/CertificateUpload.tsx');

  assert.doesNotMatch(upload, /Degree not found|Institution not found|Date not found/);
  assert.doesNotMatch(upload, /console\.error|throw err|pdfjs-dist|GlobalWorkerOptions/);
  assert.match(upload, /setError/);
  assert.match(upload, /\/api\/extract-certificate-text/);
  assert.match(upload, /degree,\s*institution,\s*graduationDate/);
});

test('generation failure recovery preserves the attempted target and exposes a target/retry path', () => {
  const flow = source('components/CVEngineFlow.tsx');

  assert.match(flow, /setResumeData\(data\)/);
  assert.match(flow, /Back to target|Volver al target/);
  assert.match(flow, /Retry trusted generation|Reintentar generación confiable/);
  assert.doesNotMatch(flow, /console\.error\('Error generating resume/);
});
