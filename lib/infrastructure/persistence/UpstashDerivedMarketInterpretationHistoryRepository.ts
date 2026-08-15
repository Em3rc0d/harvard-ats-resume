import { Redis } from '@upstash/redis';
import {
  DerivedMarketInterpretationHistoryUnavailableError,
  type DerivedMarketInterpretationHistoryRepository,
  type DerivedMarketInterpretationHistorySnapshot,
} from '../../application/market/DerivedMarketInterpretationHistory';

const KEY = 'ats2:derived-market-interpretation-history:v1';

export class UpstashDerivedMarketInterpretationHistoryRepository
implements DerivedMarketInterpretationHistoryRepository {
  constructor(private readonly redis: Redis) {}

  async load(): Promise<DerivedMarketInterpretationHistorySnapshot | null> {
    return await this.redis.get<DerivedMarketInterpretationHistorySnapshot>(KEY);
  }

  async save(snapshot: DerivedMarketInterpretationHistorySnapshot): Promise<void> {
    await this.redis.set(KEY, snapshot);
  }
}

export interface DerivedMarketInterpretationHistoryEnvironment {
  readonly UPSTASH_REDIS_REST_URL?: string;
  readonly UPSTASH_REDIS_REST_TOKEN?: string;
}

function processEnvironment(): DerivedMarketInterpretationHistoryEnvironment {
  return {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

export function createDerivedMarketInterpretationHistoryRepositoryFromEnv(
  env: DerivedMarketInterpretationHistoryEnvironment = processEnvironment(),
): DerivedMarketInterpretationHistoryRepository {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new DerivedMarketInterpretationHistoryUnavailableError(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for durable derived market interpretation history.',
    );
  }

  return new UpstashDerivedMarketInterpretationHistoryRepository(new Redis({ url, token }));
}
