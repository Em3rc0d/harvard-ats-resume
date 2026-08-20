import { NextResponse } from 'next/server';
import {
  createDurableRedisRuntimeFromEnv,
  DurablePersistenceUnavailableError,
} from '@/lib/infrastructure/persistence/DurableRedisRuntime';
import { AIProviderFailure } from '@/lib/application/ai/AIProviderFailure';
import { OllamaStructuredClient } from '@/lib/infrastructure/ai/OllamaStructuredClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DependencyStatus {
  readonly status: 'READY' | 'UNAVAILABLE';
  readonly detail?: string;
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
    const client = new OllamaStructuredClient();
    await client.assertReady();
    dependencies.localAI = { status: 'READY' };
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
