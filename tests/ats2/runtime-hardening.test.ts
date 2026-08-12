import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeCandidatePresentationText } from '../../lib/application/presentation/InlineCandidateTextCleanup';
import { resolveResumeGenerationTimeoutMs } from '../../lib/infrastructure/ai/GeminiResumeProvider';

test('final resume generation uses a bounded 120 second timeout policy', () => {
  assert.equal(resolveResumeGenerationTimeoutMs(undefined), 120_000);
  assert.equal(resolveResumeGenerationTimeoutMs('180000'), 180_000);
});

test('final resume generation rejects unsafe timeout configuration', () => {
  assert.throws(() => resolveResumeGenerationTimeoutMs('1000'), /between 30000 and 240000/);
  assert.throws(() => resolveResumeGenerationTimeoutMs('300000'), /between 30000 and 240000/);
  assert.throws(() => resolveResumeGenerationTimeoutMs('invalid'), /between 30000 and 240000/);
});

test('legacy inline optimize performs presentation cleanup without inventing candidate facts', () => {
  const input = '  - Desarrollo   de APIs REST con Spring Boot .\r\n  Integración con MongoDB  ;  Next.js.  ';
  const output = normalizeCandidatePresentationText(input);

  assert.equal(output, '• Desarrollo de APIs REST con Spring Boot.\nIntegración con MongoDB; Next.js.');
  assert.match(output, /Spring Boot/);
  assert.match(output, /MongoDB/);
  assert.match(output, /Next\.js/);
});

test('inline optimize is routed internally and contains no n8n or generative AI runtime', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.js'), 'utf8');
  const route = readFileSync(join(process.cwd(), 'app/api/optimize-content/route.ts'), 'utf8');

  assert.match(config, /NEXT_PUBLIC_N8N_OPTIMIZE_URL:\s*['"]\/api\/optimize-content['"]/);
  assert.doesNotMatch(route, /N8N|n8n|GoogleGenAI|generateContent|https?:\/\//);
  assert.match(route, /PRESENTATION_ONLY/);
});

test('certificate browser PDF.js entry is redirected away from the crashing modern root build', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.js'), 'utf8');
  const certificateUpload = readFileSync(join(process.cwd(), 'components/CertificateUpload.tsx'), 'utf8');

  assert.match(certificateUpload, /import\(['"]pdfjs-dist['"]\)/);
  assert.match(config, /pdfjs-dist\$/);
  assert.match(config, /pdfjs-dist\/legacy\/build\/pdf\.mjs/);
});
