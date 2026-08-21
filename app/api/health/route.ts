import { NextResponse } from 'next/server';
import {
  createDurableRedisRuntimeFromEnv,
  DurablePersistenceUnavailableError,
} from '@/lib/infrastructure/persistence/DurableRedisRuntime';
import { AIProviderFailure } from '@/lib/application/ai/AIProviderFailure';
import { resolveRuntimeIdentity } from '@/lib/application/system/RuntimeIdentity';
import { evaluateSystemHealth } from '@/lib/application/system/SystemHealthPolicy';
import {
  OllamaStructuredClient,
  OLLAMA_PROVIDER,
  resolveOllamaContextWindow,
  resolveOllamaModel,
} from '@/lib/infrastructure/ai/OllamaStructuredClient';
import { DEFAULT_OLLAMA_IMPORT_V3_MODEL } from '@/lib/infrastructure/import/OllamaResumeImportV3Provider';
import { DEFAULT_OLLAMA_OPTIMIZE_MODEL } from '@/lib/infrastructure/ai/OllamaCandidateTextOptimizer';
import {
  DETERMINISTIC_RESUME_CONTRACT_VERSION,
  DETERMINISTIC_RESUME_MODEL,
  DETERMINISTIC_RESUME_PROVIDER,
} from '@/lib/local-ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DependencyStatus {
  readonly status: 'READY' | 'UNAVAILABLE';
  readonly detail?: string;
}

function resolvedLocalAIModels(): {
  readonly importModel: string;
  readonly optimizeModel: string;
  readonly requiredModels: readonly string[];
} {
  const importModel = resolveOllamaModel(
    process.env.OLLAMA_IMPORT_MODEL?.trim() || DEFAULT_OLLAMA_IMPORT_V3_MODEL,
  );
  const optimizeModel = resolveOllamaModel(
    process.env.OLLAMA_OPTIMIZE_MODEL?.trim() || DEFAULT_OLLAMA_OPTIMIZE_MODEL,
  );
  return {
    importModel,
    optimizeModel,
    requiredModels: Array.from(new Set([importModel, optimizeModel])),
  };
}

function resolveCapabilityConfiguration(): Record<string, unknown> {
  try {
    const models = resolvedLocalAIModels();
    return {
      status: 'RESOLVED',
      contextWindow: resolveOllamaContextWindow(),
      capabilities: {
        resumeImport: {
          aiDependency: 'BOUNDED_ASSIST',
          provider: OLLAMA_PROVIDER,
          model: models.importModel,
        },
        inlineOptimize: {
          aiDependency: 'OPTIONAL_ENHANCEMENT',
          provider: OLLAMA_PROVIDER,
          model: models.optimizeModel,
        },
        resumeAssembly: {
          aiDependency: 'NONE',
          provider: DETERMINISTIC_RESUME_PROVIDER,
          model: DETERMINISTIC_RESUME_MODEL,
          contractVersion: DETERMINISTIC_RESUME_CONTRACT_VERSION,
        },
      },
    };
  } catch (error) {
    return {
      status: 'INVALID',
      detail: error instanceof AIProviderFailure ? error.kind : 'UNKNOWN',
    };
  }
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
    const models = resolvedLocalAIModels();
    for (const model of models.requiredModels) {
      const client = new OllamaStructuredClient({ model });
      await client.assertReady();
    }
    dependencies.localAI = {
      status: 'READY',
      detail: `${models.requiredModels.length} bounded workload model${models.requiredModels.length === 1 ? '' : 's'} ready; final resume assembly is deterministic`,
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

  const health = evaluateSystemHealth({
    localAI: dependencies.localAI.status,
    durableRedis: dependencies.durableRedis.status,
  });
  const identity = resolveRuntimeIdentity();
  const configuration = resolveCapabilityConfiguration();

  return NextResponse.json(
    {
      status: health.status,
      runtime: 'LOCAL_AI_WITH_DETERMINISTIC_FINAL_ASSEMBLY',
      trustedCoreAvailable: health.trustedCoreAvailable,
      degradedCapabilities: health.degradedCapabilities,
      identity,
      configuration,
      dependencies,
    },
    {
      status: health.httpStatus,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  );
}
