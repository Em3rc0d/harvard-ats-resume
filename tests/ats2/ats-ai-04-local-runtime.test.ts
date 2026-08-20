import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AIProviderFailure } from '../../lib/application/ai/AIProviderFailure';
import {
  DEFAULT_OLLAMA_MODEL,
  OLLAMA_PROVIDER,
  OllamaStructuredClient,
  resolveOllamaBaseUrl,
  resolveOllamaContextWindow,
  resolveOllamaModel,
} from '../../lib/infrastructure/ai/OllamaStructuredClient';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('CV Engine source runtime no longer depends on the removed remote model SDK', () => {
  const packageJson = JSON.parse(source('package.json')) as { dependencies?: Record<string, string> };
  const env = source('.env.example');
  const generation = source('app/api/generate-resume/route.ts');
  const importer = source('lib/infrastructure/import/NativeResumeImportProvider.ts');
  const optimizer = source('app/api/optimize-content/route.ts');

  assert.equal(packageJson.dependencies?.['@google/genai'], undefined);
  assert.equal(existsSync(join(process.cwd(), 'lib/gemini.ts')), false);
  assert.equal(existsSync(join(process.cwd(), 'lib/infrastructure/ai/GeminiResumeProvider.ts')), false);
  assert.equal(existsSync(join(process.cwd(), 'lib/infrastructure/ai/GeminiCandidateTextOptimizer.ts')), false);
  assert.doesNotMatch(env, /GEMINI_API_KEY/);
  assert.match(generation, /generateResumeWithAI/);
  assert.match(generation, /OLLAMA_RESUME_PROVIDER/);
  assert.match(importer, /OllamaStructuredClient/);
  assert.match(optimizer, /OllamaCandidateTextOptimizer/);
});

test('local runtime defaults to a bounded configurable Qwen3 model contract', () => {
  assert.equal(OLLAMA_PROVIDER, 'ollama-local');
  assert.equal(DEFAULT_OLLAMA_MODEL, 'qwen3:8b');
  assert.equal(resolveOllamaModel(undefined), 'qwen3:8b');
  assert.equal(resolveOllamaBaseUrl(undefined), 'http://127.0.0.1:11434');
  assert.equal(resolveOllamaContextWindow(undefined), 16_384);
  assert.equal(resolveOllamaContextWindow('32768'), 32_768);
  assert.throws(() => resolveOllamaContextWindow('1024'), /between 4096 and 65536/);
  assert.throws(() => resolveOllamaBaseUrl('file:///tmp/ollama'), /http or https/);
});

test('Ollama structured generation sends schema-constrained non-thinking deterministic requests', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  let requestBody: Record<string, unknown> | undefined;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      model: 'qwen3:8b',
      done: true,
      message: { role: 'assistant', content: '{"value":"source-backed"}' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const client = new OllamaStructuredClient({
      baseUrl: 'http://ollama:11434',
      model: 'qwen3:8b',
      contextWindow: 16_384,
    });
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: { value: { type: 'string' } },
      required: ['value'],
    } as const;

    const result = await client.generateStructured({
      system: 'Only source-backed facts.',
      prompt: 'Return the source-backed value.',
      schema,
      timeoutMs: 5_000,
    });

    assert.deepEqual(result, { value: 'source-backed' });
    assert.equal(requestUrl, 'http://ollama:11434/api/chat');
    assert.deepEqual(requestBody?.format, schema);
    assert.equal(requestBody?.think, false);
    assert.equal(requestBody?.stream, false);
    assert.equal(requestBody?.model, 'qwen3:8b');
    const options = requestBody?.options as Record<string, unknown>;
    assert.equal(options.temperature, 0);
    assert.equal(options.seed, 42);
    assert.equal(options.num_ctx, 16_384);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Ollama readiness fails closed when the configured model is not installed', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    models: [{ name: 'qwen3:4b' }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

  try {
    const client = new OllamaStructuredClient({
      baseUrl: 'http://ollama:11434',
      model: 'qwen3:8b',
      contextWindow: 16_384,
    });
    await assert.rejects(
      () => client.assertReady(),
      (error: unknown) => error instanceof AIProviderFailure
        && error.kind === 'PROVIDER_UNAVAILABLE'
        && error.retryable === false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Docker stack owns app, local model and durable Redis dependencies', () => {
  const compose = source('docker-compose.yml');
  const dockerfile = source('Dockerfile');
  const health = source('app/api/health/route.ts');

  assert.match(compose, /ollama\/ollama:latest/);
  assert.match(compose, /ollama pull "\$\$\{OLLAMA_MODEL\}"/);
  assert.match(compose, /OLLAMA_BASE_URL: http:\/\/ollama:11434/);
  assert.match(compose, /redis:7-alpine/);
  assert.match(compose, /hiett\/serverless-redis-http:latest/);
  assert.match(compose, /UPSTASH_REDIS_REST_URL: http:\/\/redis-http:80/);
  assert.match(compose, /service_completed_successfully/);
  assert.match(dockerfile, /node:24-bookworm-slim/);
  assert.match(dockerfile, /\/api\/health/);
  assert.match(health, /client\.assertReady\(\)/);
  assert.match(health, /runtime\.assertReady\(\)/);
});
