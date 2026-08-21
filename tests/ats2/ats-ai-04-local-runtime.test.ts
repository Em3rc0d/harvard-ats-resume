import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImportedCandidateDraft } from '../../lib/application/import/ResumeImportProvider';
import { AIProviderFailure } from '../../lib/application/ai/AIProviderFailure';
import {
  DEFAULT_OLLAMA_MODEL,
  OLLAMA_PROVIDER,
  OllamaStructuredClient,
  resolveOllamaBaseUrl,
  resolveOllamaContextWindow,
  resolveOllamaModel,
} from '../../lib/infrastructure/ai/OllamaStructuredClient';
import {
  DEFAULT_OLLAMA_IMPORT_V3_MODEL,
  IMPORT_V3_MAX_SECTION_OUTPUT_TOKENS,
  ResumeExtractionIncompleteError,
  assertResumeExtractionCompleteness,
  detectResumeSectionSignals,
  splitResumeIntoSections,
} from '../../lib/infrastructure/import/OllamaResumeImportV3Provider';
import {
  DEFAULT_OLLAMA_RESUME_MODEL,
  RESUME_MAX_OUTPUT_TOKENS,
} from '../../lib/infrastructure/ai/OllamaResumeProvider';
import {
  DEFAULT_OLLAMA_OPTIMIZE_MODEL,
  INLINE_OPTIMIZER_MAX_OUTPUT_TOKENS,
} from '../../lib/infrastructure/ai/OllamaCandidateTextOptimizer';
import {
  DETERMINISTIC_RESUME_CONTRACT_VERSION,
  DETERMINISTIC_RESUME_MODEL,
  DETERMINISTIC_RESUME_PROVIDER,
} from '../../lib/local-ai';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('CV Engine source runtime no longer depends on the removed remote model SDK', () => {
  const packageJson = JSON.parse(source('package.json')) as { dependencies?: Record<string, string> };
  const env = source('.env.example');
  const generation = source('app/api/generate-resume/route.ts');
  const localAssembly = source('lib/local-ai.ts');
  const importerRoute = source('app/api/import-resume/route.ts');
  const importer = source('lib/infrastructure/import/OllamaResumeImportV3Provider.ts');
  const optimizer = source('app/api/optimize-content/route.ts');

  assert.equal(packageJson.dependencies?.['@google/genai'], undefined);
  assert.equal(existsSync(join(process.cwd(), 'lib/gemini.ts')), false);
  assert.equal(existsSync(join(process.cwd(), 'lib/infrastructure/ai/GeminiResumeProvider.ts')), false);
  assert.equal(existsSync(join(process.cwd(), 'lib/infrastructure/ai/GeminiCandidateTextOptimizer.ts')), false);
  assert.doesNotMatch(env, /GEMINI_API_KEY/);
  assert.match(generation, /generateResumeWithAI/);
  assert.match(localAssembly, /generateResumeWithAI = generateResumeDraft/);
  assert.doesNotMatch(localAssembly, /new OllamaResumeProvider|generateStructured\(/);
  assert.match(importerRoute, /OllamaResumeImportV3Provider/);
  assert.match(importer, /OllamaStructuredClient/);
  assert.match(importer, /reconcileCandidateToSource/);
  assert.match(optimizer, /OllamaCandidateTextOptimizer/);
});

test('local runtime defaults to bounded workload-specific contracts', () => {
  assert.equal(OLLAMA_PROVIDER, 'ollama-local');
  assert.equal(DEFAULT_OLLAMA_MODEL, 'qwen3:8b');
  assert.equal(DEFAULT_OLLAMA_IMPORT_V3_MODEL, 'qwen3:1.7b');
  assert.equal(DEFAULT_OLLAMA_RESUME_MODEL, 'qwen3:4b-instruct');
  assert.equal(DEFAULT_OLLAMA_OPTIMIZE_MODEL, 'qwen3:4b-instruct');
  assert.equal(IMPORT_V3_MAX_SECTION_OUTPUT_TOKENS, 1_024);
  assert.equal(RESUME_MAX_OUTPUT_TOKENS, 2_048);
  assert.equal(INLINE_OPTIMIZER_MAX_OUTPUT_TOKENS, 768);
  assert.equal(DETERMINISTIC_RESUME_PROVIDER, 'cv-engine-deterministic');
  assert.equal(DETERMINISTIC_RESUME_MODEL, 'source-preserving-resume-composer-v2');
  assert.equal(DETERMINISTIC_RESUME_CONTRACT_VERSION, 'ats2-evidence-bound-resume-v2');
  assert.equal(resolveOllamaModel(undefined), 'qwen3:8b');
  assert.equal(resolveOllamaBaseUrl(undefined), 'http://127.0.0.1:11434');
  assert.equal(resolveOllamaContextWindow(undefined), 16_384);
  assert.equal(resolveOllamaContextWindow('32768'), 32_768);
  assert.throws(() => resolveOllamaContextWindow('1024'), /between 4096 and 65536/);
  assert.throws(() => resolveOllamaBaseUrl('file:///tmp/ollama'), /http or https/);
});

test('sectioned resume import isolates preamble and explicit career sections', () => {
  const document = {
    format: 'DOCX' as const,
    text: [
      'Candidate Name',
      'candidate@example.com',
      'Lima, Peru',
      'PROFESSIONAL SUMMARY',
      'Source-backed summary.',
      'EXPERIENCE',
      'Source Company',
      'EDUCATION',
      'Source University',
      'TECHNICAL SKILLS',
      'TypeScript',
      'PROJECTS',
      'Source Project',
      'CERTIFICATIONS',
      'Source Certificate',
      'LANGUAGES',
      'Spanish',
    ].join('\n'),
    pages: [{ text: 'fixture' }],
  };

  const sectioned = splitResumeIntoSections(document);
  assert.match(sectioned.preamble, /Candidate Name/);
  assert.match(sectioned.preamble, /candidate@example\.com/);
  assert.match(sectioned.sections.get('summary') ?? '', /Source-backed summary/);
  assert.match(sectioned.sections.get('experience') ?? '', /Source Company/);
  assert.match(sectioned.sections.get('education') ?? '', /Source University/);
  assert.match(sectioned.sections.get('skills') ?? '', /TypeScript/);
  assert.match(sectioned.sections.get('projects') ?? '', /Source Project/);
  assert.match(sectioned.sections.get('certifications') ?? '', /Source Certificate/);
  assert.match(sectioned.sections.get('languages') ?? '', /Spanish/);
});

test('Ollama resume import refuses silent omission of explicit DOCX sections', () => {
  const document = {
    format: 'DOCX' as const,
    text: [
      'PROFESSIONAL SUMMARY',
      'Source-backed summary.',
      'EXPERIENCE',
      'Source Company',
      'EDUCATION',
      'Source University',
      'TECHNICAL SKILLS',
      'TypeScript',
      'PROJECTS',
      'Source Project',
      'CERTIFICATIONS',
      'Source Certificate',
      'LANGUAGES',
      'Spanish',
    ].join('\n'),
    pages: [{ text: 'fixture' }],
  };

  const candidate = {
    personalInfo: {
      fullName: 'Candidate',
      email: '',
      location: '',
      linkedin: '',
      github: '',
    },
    summary: 'Source-backed summary.',
    experience: [],
    education: [],
    skills: { hardSkills: [], softSkills: [] },
    projects: [],
    certifications: [],
    languages: [],
  } as ImportedCandidateDraft;

  assert.deepEqual(detectResumeSectionSignals(document), [
    'summary',
    'experience',
    'education',
    'skills',
    'projects',
    'certifications',
    'languages',
  ]);

  assert.throws(
    () => assertResumeExtractionCompleteness(document, candidate),
    (error: unknown) => error instanceof ResumeExtractionIncompleteError
      && error.missingSections.includes('experience')
      && error.missingSections.includes('education')
      && error.missingSections.includes('skills')
      && error.missingSections.includes('projects')
      && error.missingSections.includes('certifications')
      && error.missingSections.includes('languages'),
  );
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
      done_reason: 'stop',
      total_duration: 1_000_000_000,
      eval_count: 10,
      eval_duration: 500_000_000,
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
    assert.equal(options.num_predict, 4_096);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Ollama readiness fails closed when the configured model is not installed', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    models: [{ name: 'qwen3:1.7b' }],
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

test('Docker stack owns bounded local models and durable Redis dependencies', () => {
  const compose = source('docker-compose.yml');
  const dockerfile = source('Dockerfile');
  const health = source('app/api/health/route.ts');

  assert.match(compose, /ollama\/ollama:0\.32\.6/);
  assert.match(compose, /OLLAMA_MODEL: \$\{DOCKER_OLLAMA_MODEL:-qwen3:1\.7b\}/);
  assert.match(compose, /OLLAMA_IMPORT_MODEL: \$\{DOCKER_OLLAMA_IMPORT_MODEL:-qwen3:1\.7b\}/);
  assert.match(compose, /OLLAMA_OPTIMIZE_MODEL: \$\{DOCKER_OLLAMA_OPTIMIZE_MODEL:-qwen3:4b-instruct\}/);
  assert.doesNotMatch(compose, /OLLAMA_RESUME_MODEL/);
  assert.doesNotMatch(compose, /qwen3:8b/);
  assert.match(compose, /DOCKER_OLLAMA_NUM_CTX:-8192/);
  assert.match(compose, /ollama pull "\$\$\{model\}"/);
  assert.match(compose, /ollama run "\$\$\{OLLAMA_IMPORT_MODEL\}" ""/);
  assert.match(compose, /OLLAMA_MAX_LOADED_MODELS: \$\{OLLAMA_MAX_LOADED_MODELS:-1\}/);
  assert.match(compose, /DOCKER_RESUME_IMPORT_TIMEOUT_MS:-180000/);
  assert.match(compose, /OLLAMA_BASE_URL: http:\/\/ollama:11434/);
  assert.match(compose, /redis:7-alpine/);
  assert.match(compose, /hiett\/serverless-redis-http:latest/);
  assert.match(compose, /wget --spider -q http:\/\/127\.0\.0\.1:80/);
  assert.match(compose, /UPSTASH_REDIS_REST_URL: http:\/\/redis-http:80/);
  assert.match(compose, /service_completed_successfully/);
  assert.match(compose, /redis-http:\s*\n\s*condition: service_healthy/);
  assert.match(dockerfile, /node:24-bookworm-slim/);
  assert.match(dockerfile, /\/api\/health/);
  assert.match(health, /DEFAULT_OLLAMA_IMPORT_V3_MODEL/);
  assert.doesNotMatch(health, /DEFAULT_OLLAMA_RESUME_MODEL|OLLAMA_RESUME_MODEL/);
  assert.match(health, /requiredLocalModels\(\)/);
  assert.match(health, /client\.assertReady\(\)/);
  assert.match(health, /runtime\.assertReady\(\)/);
});
