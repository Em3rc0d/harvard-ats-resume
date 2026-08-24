import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveStructuredContextWindow } from '../../lib/infrastructure/ai/OllamaStructuredClient';

test('small structured requests shrink to the minimum safe context instead of paying for configured 16K', () => {
  assert.equal(resolveStructuredContextWindow({
    configuredContextWindow: 16_384,
    system: 'bounded extraction '.repeat(20),
    prompt: 'short resume section '.repeat(30),
    maxOutputTokens: 1_024,
  }), 4_096);
});

test('large structured requests may grow but never exceed the configured context ceiling', () => {
  const configuredContextWindow = 16_384;
  const resolved = resolveStructuredContextWindow({
    configuredContextWindow,
    system: 'system '.repeat(1_000),
    prompt: 'large evidence payload '.repeat(4_000),
    maxOutputTokens: 4_096,
  });

  assert.equal(resolved, configuredContextWindow);
});

test('structured-output schema is enforced once through Ollama format instead of duplicated in the prompt', () => {
  const source = readFileSync('lib/infrastructure/ai/OllamaStructuredClient.ts', 'utf8');
  assert.match(source, /format: request\.schema/);
  assert.match(source, /\{ role: 'user', content: request\.prompt \}/);
  assert.doesNotMatch(source, /JSON SCHEMA — obey exactly/);
  assert.match(source, /effectiveContextWindow/);
  assert.match(source, /configuredContextWindow/);
});
