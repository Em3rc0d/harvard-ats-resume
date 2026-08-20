import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeGeneratedResumeText } from '../../lib/application/resume/ResumeTextNormalization';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('server resume PDF import bypasses Webpack transformation through an exact runtime adapter', () => {
  const config = source('next.config.js');
  const adapter = source('lib/infrastructure/import/PdfJsNodeRuntime.ts');
  const nativeImporter = source('lib/infrastructure/import/NativeResumeImportProvider.ts');

  assert.match(config, /pdfjs-dist\/legacy\/build\/pdf\.mjs\$/);
  assert.match(config, /PdfJsNodeRuntime\.ts/);
  assert.doesNotMatch(config, /serverExternalPackages:\s*\[[^\]]*pdfjs-dist/);
  assert.match(adapter, /webpackIgnore:\s*true/);
  assert.match(adapter, /pdfjs-dist\/legacy\/build\/pdf\.mjs/);
  assert.match(nativeImporter, /import\(['"]pdfjs-dist\/legacy\/build\/pdf\.mjs['"]\)/);
});

test('local generation contract preserves candidate language and deterministic record separators', () => {
  const provider = source('lib/infrastructure/ai/OllamaResumeProvider.ts');

  assert.match(provider, /Do not translate candidate content/i);
  assert.match(provider, /COMPANY — ROLE/);
  assert.match(provider, /CERTIFICATION NAME — ISSUER — DATE/);
  assert.match(provider, /Do not use pipes as field separators/);
});

test('resume normalization converts pipe-delimited structured records without changing their facts', () => {
  const input = `JANE CANDIDATE
EXPERIENCE
Acme | Backend Engineer | Feb. 2025
• Built APIs with TypeScript.
CERTIFICATIONS
Full-Stack Development | Mimo.org | 2024`;

  const output = normalizeGeneratedResumeText(input);

  assert.match(output, /EXPERIENCE\nAcme — Backend Engineer\nFeb\. 2025/);
  assert.match(output, /CERTIFICATIONS\nFull-Stack Development — Mimo\.org — 2024/);
  assert.doesNotMatch(output, /Acme \| Backend Engineer \| Feb\. 2025/);
  assert.doesNotMatch(output, /Full-Stack Development \| Mimo\.org \| 2024/);
});
