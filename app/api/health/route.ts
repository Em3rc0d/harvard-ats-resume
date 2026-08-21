import { NextResponse } from 'next/server';
import {
  createDurableRedisRuntimeFromEnv,
  DurablePersistenceUnavailableError,
} from '@/lib/infrastructure/persistence/DurableRedisRuntime';
import { AIProviderFailure } from '@/lib/application/ai/AIProviderFailure';
import { OllamaStructuredClient, resolveOllamaModel } from '@/lib/infrastructure/ai/OllamaStructuredClient';
import { DEFAULT_OLLAMA_IMPORT_V3_MODEL } from '@/lib/infrastructure/import/OllamaResumeImportV3Provider';
import { DEFAULT_OLLAMA_OPTIMIZE_MODEL } from '@/lib/infrastructure/ai/OllamaCandidateTextOptimizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DependencyStatus {
  readonly status: 'READY' | 'UNAVAILABLE';
  readonly detail?: string;
}

function requiredLocalModels(): string[] {
  return Array.from(new Set([
    resolveOllamaModel(process.env.OLLAMA_IMPORT_MODEL?.trim() || DEFAULT_OLLAMA_IMPORT_V3_MODEL),
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
      detail: `${models.length} bounded workload model${models.length === 1 ? '' : 's'} ready; final resume assembly is deterministic`,
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
      runtime: 'LOCAL_AI_WITH_DETERMINISTIC_FINAL_ASSEMBLY',
      dependencies,
    },
    {
      status: ready ? 200 : 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  );
}
