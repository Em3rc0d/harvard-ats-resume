import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeCandidatePresentationText } from '../../lib/application/presentation/InlineCandidateTextCleanup';
import { normalizeGeneratedResumeText } from '../../lib/application/resume/ResumeTextNormalization';
import { resolveResumeGenerationTimeoutMs } from '../../lib/infrastructure/ai/OllamaResumeProvider';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('final resume generation uses a bounded 120 second timeout policy', () => {
  assert.equal(resolveResumeGenerationTimeoutMs(undefined), 120_000);
  assert.equal(resolveResumeGenerationTimeoutMs('180000'), 180_000);
});

test('final resume generation rejects unsafe timeout configuration', () => {
  assert.throws(() => resolveResumeGenerationTimeoutMs('1000'), /between 30000 and 240000/);
  assert.throws(() => resolveResumeGenerationTimeoutMs('300000'), /between 30000 and 240000/);
  assert.throws(() => resolveResumeGenerationTimeoutMs('invalid'), /between 30000 and 240000/);
});

test('legacy presentation cleanup remains deterministic and never invents candidate facts', () => {
  const input = '  - Desarrollo   de APIs REST con Spring Boot .\r\n  Integración con MongoDB  ;  Next.js.  ';
  const output = normalizeCandidatePresentationText(input);

  assert.equal(output, '• Desarrollo de APIs REST con Spring Boot.\nIntegración con MongoDB; Next.js.');
  assert.match(output, /Spring Boot/);
  assert.match(output, /MongoDB/);
  assert.match(output, /Next\.js/);
});

test('generated resume normalization repairs literal newline serialization without changing wording', () => {
  const serialized = 'JANE CANDIDATE\\nPROFESSIONAL SUMMARY\\nBackend engineer focused on TypeScript APIs.\\nEXPERIENCE\\n• Built TypeScript APIs.';
  const output = normalizeGeneratedResumeText(serialized);

  assert.equal(
    output,
    'JANE CANDIDATE\nPROFESSIONAL SUMMARY\nBackend engineer focused on TypeScript APIs.\nEXPERIENCE\n• Built TypeScript APIs.',
  );
});

test('generated resume normalization recovers compressed uppercase sections and bullets', () => {
  const compressed = 'JANE CANDIDATE PROFESSIONAL SUMMARY Backend engineer focused on TypeScript APIs. EXPERIENCE ACME — BACKEND ENGINEER • Built TypeScript APIs.';
  const output = normalizeGeneratedResumeText(compressed);

  assert.match(output, /JANE CANDIDATE\nPROFESSIONAL SUMMARY\nBackend engineer focused on TypeScript APIs\./);
  assert.match(output, /\nEXPERIENCE\nACME — BACKEND ENGINEER\n• Built TypeScript APIs\./);
});

test('inline optimize stays on the internal endpoint and local-model output crosses a deterministic truth guard', () => {
  const config = source('next.config.js');
  const form = source('components/ResumeForm.tsx');
  const route = source('app/api/optimize-content/route.ts');
  const optimizer = source('lib/application/presentation/CandidateTextOptimizer.ts');
  const provider = source('lib/infrastructure/ai/OllamaCandidateTextOptimizer.ts');

  assert.match(config, /NEXT_PUBLIC_N8N_OPTIMIZE_URL:\s*['"]\/api\/optimize-content['"]/);
  assert.doesNotMatch(form, /https?:\/\/[^'"`]*n8n|webhook[^'"`]*n8n/i);
  assert.match(route, /optimizeCandidateText/);
  assert.match(route, /OllamaCandidateTextOptimizer/);
  assert.doesNotMatch(route, /jobDescription|CareerTarget|JobRequirement|MatchReport/);

  assert.match(optimizer, /PRESENTATION_ONLY_FALLBACK/);
  assert.match(optimizer, /unsupported numeric fact/);
  assert.match(optimizer, /unsupported URL/);
  assert.match(optimizer, /unsupported email address/);
  assert.match(optimizer, /unsupported factual vocabulary/);
  assert.match(optimizer, /validateFactPreservingInlineRewrite/);

  assert.match(provider, /source text is the ONLY authority/i);
  assert.match(provider, /Never add metrics/);
  assert.match(provider, /generateStructured/);
  assert.match(provider, /schema:\s*RESPONSE_SCHEMA/);
});

test('PDF.js is server-only and certificate PDF extraction cannot mount it in the browser', () => {
  const config = source('next.config.js');
  const certificateUpload = source('components/CertificateUpload.tsx');
  const certificateRoute = source('app/api/extract-certificate-text/route.ts');
  const nativeResumeImport = source('lib/infrastructure/import/NativeResumeImportProvider.ts');
  const nodeRuntime = source('lib/infrastructure/import/PdfJsNodeRuntime.ts');

  assert.doesNotMatch(certificateUpload, /pdfjs-dist|GlobalWorkerOptions|pdf\.worker/);
  assert.match(certificateUpload, /\/api\/extract-certificate-text/);
  assert.match(certificateRoute, /extractResumeText/);
  assert.match(config, /pdfjs-dist\/legacy\/build\/pdf\.mjs\$/);
  assert.match(config, /PdfJsNodeRuntime\.ts/);
  assert.doesNotMatch(config, /pdfjs-dist\$/);
  assert.doesNotMatch(config, /serverExternalPackages:\s*\[[\s\S]*?['"]pdfjs-dist['"]/);
  assert.match(nodeRuntime, /webpackIgnore:\s*true/);
  assert.match(nodeRuntime, /pdfjs-dist\/legacy\/build\/pdf\.mjs/);
  assert.match(nativeResumeImport, /pdfjs-dist\/legacy\/build\/pdf\.mjs/);
});

test('composition failures are not presented as Career Vault persistence failures', () => {
  const guardrailPanel = source('components/GenerationGuardrailPanel.tsx');

  assert.match(guardrailPanel, /const isComposition = Boolean\(failure\.composition\)/);
  assert.match(guardrailPanel, /const isPersistence = Boolean\(failure\.persistence\)/);
  assert.doesNotMatch(guardrailPanel, /failure\.persistence\s*\|\|\s*failure\.composition/);
  assert.match(guardrailPanel, /No se emitió ninguna ResumeVersion/);
});
