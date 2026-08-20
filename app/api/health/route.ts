import { NextResponse } from 'next/server';
import {
  createDurableRedisRuntimeFromEnv,
  DurablePersistenceUnavailableError,
} from '@/lib/infrastructure/persistence/DurableRedisRuntime';
import { AIProviderFailure } from '@/lib/application/ai/AIProviderFailure';
import { OllamaStructuredClient, resolveOllamaModel } from '@/lib/infrastructure/ai/OllamaStructuredClient';
import { DEFAULT_OLLAMA_IMPORT_MODEL } from '@/lib/infrastructure/import/NativeResumeImportProvider';
import { DEFAULT_OLLAMA_RESUME_MODEL } from '@/lib/infrastructure/ai/OllamaResumeProvider';
import { DEFAULT_OLLAMA_OPTIMIZE_MODEL } from '@/lib/infrastructure/ai/OllamaCandidateTextOptimizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DependencyStatus {
  readonly status: 'READY' | 'UNAVAILABLE';
  readonly detail?: string;
}

function requiredLocalModels(): string[] {
  return Array.from(new Set([
    resolveOllamaModel(process.env.OLLAMA_IMPORT_MODEL?.trim() || DEFAULT_OLLAMA_IMPORT_MODEL),
    resolveOllamaModel(process.env.OLLAMA_RESUME_MODEL?.trim() || DEFAULT_OLLAMA_RESUME_MODEL),
    resolveOllamaModel(process.env.OLLAMA_OPTIMIZE_MODEL?.trim() || DEFAULT_OLLAMA_OPTIMIZE_MODEL),
  ]));
}

export async function GET() {
  const dependencies: {
    localAI: DependencyStatus;
    durableRedis: DependencyStatus;
  } = {
    localAI: { status: 'UNAVAILABLE' },
    durableRedis: { status: 'UNAVAILABLE' },
  };

  try {
    const models = requiredLocalModels();
    for (const model of models) {
      const client = new OllamaStructuredClient({ model });
      await client.assertReady();
    }
    dependencies.localAI = {
      status: 'READY',
      detail: `${models.length} workload model${models.length === 1 ? '' : 's'} ready`,
    };
  } catch (error) {
    dependencies.localAI = {
      status: 'UNAVAILABLE',
      detail: error instanceof AIProviderFailure ? error.kind : 'UNKNOWN',
    };
  }

  try {
    const runtime = createDurableRedisRuntimeFromEnv();
    await runtime.assertReady();
    dependencies.durableRedis = { status: 'READY' };
  } catch (error) {
    dependencies.durableRedis = {
      status: 'UNAVAILABLE',
      detail: error instanceof DurablePersistenceUnavailableError ? error.reason : 'UNKNOWN',
    };
  }

  const ready = dependencies.localAI.status === 'READY' && dependencies.durableRedis.status === 'READY';

  return NextResponse.json(
    {
      status: ready ? 'READY' : 'DEGRADED',
      runtime: 'LOCAL_AI',
      dependencies,
    },
    {
      status: ready ? 200 : 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  );
}