import { Redis } from '@upstash/redis';
import {
  MarketJobProjectionHistoryUnavailableError,
  type MarketJobProjectionHistoryRepository,
  type MarketJobProjectionHistorySnapshot,
} from '../../application/market/MarketJobProjectionHistory';

const KEY = 'ats2:market-job-projection-history:v1';

/**
 * First durable M4B-05 store. Like the earlier market histories, this is a
 * single versioned snapshot and is intentionally not approved for parallel
 * provider-scale workers until partitioning/concurrency is introduced.
 */
export class UpstashMarketJobProjectionHistoryRepository implements MarketJobProjectionHistoryRepository {
  constructor(private readonly redis: Redis) {}

  async load(): Promise<MarketJobProjectionHistorySnapshot | null> {
    return await this.redis.get<MarketJobProjectionHistorySnapshot>(KEY);
  }

  async save(snapshot: MarketJobProjectionHistorySnapshot): Promise<void> {
    await this.redis.set(KEY, snapshot);
  }
}

export interface MarketJobProjectionHistoryEnvironment {
  readonly UPSTASH_REDIS_REST_URL?: string;
  readonly UPSTASH_REDIS_REST_TOKEN?: string;
}

function processEnvironment(): MarketJobProjectionHistoryEnvironment {
  return {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

export function createMarketJobProjectionHistoryRepositoryFromEnv(
  env: MarketJobProjectionHistoryEnvironment = processEnvironment(),
): MarketJobProjectionHistoryRepository {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new MarketJobProjectionHistoryUnavailableError(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for durable market job projection history.',
    );
  }
  return new UpstashMarketJobProjectionHistoryRepository(new Redis({ url, token }));
}
