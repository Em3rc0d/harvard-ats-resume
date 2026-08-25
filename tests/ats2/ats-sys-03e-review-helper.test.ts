import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

test('ATS-SYS-03E review helper remains source-only and cannot self-label from model/import output', () => {
  const review = read('scripts/system-real-world-corpus-review.mjs');

  assert.match(review, /oraclePolicy: 'HUMAN_AUTHORED_FROM_SOURCE_ONLY'/);
  assert.match(review, /modelUsed: false/);
  assert.match(review, /importApiUsed: false/);
  assert.match(review, /Do not use CV Engine or Ollama output as ground truth/);
  assert.doesNotMatch(review, /api\/import-resume/);
  assert.doesNotMatch(review, /OllamaStructuredClient/);
  assert.doesNotMatch(review, /OLLAMA_/);
});

test('ATS-SYS-03E review helper pins sources, stays outside Git, and writes only private local review material', () => {
  const review = read('scripts/system-real-world-corpus-review.mjs');

  assert.match(review, /review input must live outside the repository/);
  assert.match(review, /sha256 mismatch; source changed after inventory/);
  assert.match(review, /const OPAQUE_DOCUMENT_ID = \/\^RW-/);
  assert.match(review, /\.ats-sys-03e-review/);
  assert.match(review, /mode: 0o700/);
  assert.match(review, /mode: 0o600/);
});

test('ATS-SYS-03E review helper mirrors the product mechanical text extraction primitives', () => {
  const review = read('scripts/system-real-world-corpus-review.mjs');
  const nativeImporter = read('lib/infrastructure/import/NativeResumeImportProvider.ts');

  for (const expected of [
    /pdfjs-dist\/legacy\/build\/pdf\.mjs/,
    /getTextContent\(\)/,
    /hasEOL/,
    /join\('\\n'\)/,
    /mammoth\.extractRawText/,
  ]) {
    assert.match(review, expected);
    assert.match(nativeImporter, expected);
  }
  assert.match(review, /MIN_MACHINE_READABLE_TEXT = 80/);
  assert.match(nativeImporter, /MIN_MACHINE_READABLE_TEXT = 80/);
});

test('ATS-SYS-03E exposes inventory, review, raw corpus and reference commands separately', () => {
  const pkg = JSON.parse(read('package.json'));

  assert.equal(pkg.scripts['system:real-corpus:inventory'], 'node scripts/system-real-world-corpus-inventory.mjs');
  assert.equal(pkg.scripts['system:real-corpus:review'], 'node scripts/system-real-world-corpus-review.mjs');
  assert.equal(pkg.scripts['system:real-corpus'], 'node scripts/system-real-world-corpus.mjs');
  assert.equal(pkg.scripts['system:real-corpus:reference'], 'node scripts/system-real-world-corpus-reference.mjs');
});
