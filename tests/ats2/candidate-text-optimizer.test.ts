import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  optimizeCandidateText,
  validateFactPreservingInlineRewrite,
  type CandidateTextOptimizationProvider,
} from '../../lib/application/presentation/CandidateTextOptimizer';

class StaticProvider implements CandidateTextOptimizationProvider {
  constructor(private readonly output: string, private readonly failure?: Error) {}

  async optimize(): Promise<string> {
    if (this.failure) throw this.failure;
    return this.output;
  }
}

test('inline optimizer accepts a conservative rewrite that preserves factual vocabulary', async () => {
  const source = 'Trabajo con Spring Boot y MongoDB en APIs REST.';
  const provider = new StaticProvider('Trabajo con Spring Boot y MongoDB en APIs REST, de forma clara y estructurada.');

  const result = await optimizeCandidateText(source, provider);

  assert.equal(result.mode, 'FACT_PRESERVING_AI');
  assert.match(result.output, /Spring Boot/);
  assert.match(result.output, /MongoDB/);
  assert.equal(result.fallbackReason, undefined);
});

test('inline optimizer rejects a new numeric claim and falls back to source-safe presentation', async () => {
  const source = 'Desarrollé APIs REST con Spring Boot.';
  const provider = new StaticProvider('Desarrollé APIs REST con Spring Boot y mejoré el rendimiento en 35%.');

  const result = await optimizeCandidateText(source, provider);

  assert.equal(result.mode, 'PRESENTATION_ONLY_FALLBACK');
  assert.equal(result.output, source);
  assert.match(result.fallbackReason ?? '', /numeric fact/i);
});

test('inline optimizer rejects novel domain vocabulary that could become fabricated candidate truth', async () => {
  const source = 'Desarrollé APIs REST con Spring Boot.';
  const provider = new StaticProvider('Desarrollé APIs REST con Spring Boot y Kubernetes.');

  const result = await optimizeCandidateText(source, provider);

  assert.equal(result.mode, 'PRESENTATION_ONLY_FALLBACK');
  assert.doesNotMatch(result.output, /Kubernetes/);
  assert.match(result.fallbackReason ?? '', /unsupported factual vocabulary/i);
});

test('inline optimizer falls back deterministically when the model is unavailable', async () => {
  const source = '  * Spring Boot   y MongoDB  ';
  const provider = new StaticProvider('', new Error('provider unavailable'));

  const result = await optimizeCandidateText(source, provider);

  assert.equal(result.mode, 'PRESENTATION_ONLY_FALLBACK');
  assert.equal(result.output, '• Spring Boot y MongoDB');
});

test('fact-preserving validator never permits new URLs or emails', () => {
  assert.throws(
    () => validateFactPreservingInlineRewrite('Portfolio disponible.', 'Portfolio disponible en https://example.com.'),
    /unsupported URL/i,
  );

  assert.throws(
    () => validateFactPreservingInlineRewrite('Contacto disponible.', 'Contacto: fake@example.com.'),
    /unsupported email/i,
  );
});
