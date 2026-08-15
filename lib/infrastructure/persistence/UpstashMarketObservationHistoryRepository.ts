import { Redis } from '@upstash/redis';
import {
  MarketObservationHistoryUnavailableError,
  type MarketObservationHistoryRepository,
  type MarketObservationHistorySnapshot,
} from '../../application/market/MarketObservationHistory';

const KEY = 'ats2:market-observation-history:v1';

/**
 * M4B-02B persists one integrity-validated market-history snapshot with a single
 * Redis SET. This keeps the first history contract simple and atomic at the
 * value level; provider-scale partitioning/concurrency is a later acquisition
 * concern, not part of semantic occurrence tracking.
 */
export class UpstashMarketObservationHistoryRepository implements MarketObservationHistoryRepository {
  constructor(private readonly redis: Redis) {}

  async load(): Promise<MarketObservationHistorySnapshot | null> {
    return await this.redis.get<MarketObservationHistorySnapshot>(KEY);
  }

  async save(snapshot: MarketObservationHistorySnapshot): Promise<void> {
    await this.redis.set(KEY, snapshot);
  }
}

export interface MarketObservationHistoryEnvironment {
  readonly UPSTASH_REDIS_REST_URL?: string;
  readonly UPSTASH_REDIS_REST_TOKEN?: string;
}

function processMarketObservationHistoryEnvironment(): MarketObservationHistoryEnvironment {
  return {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

export function createMarketObservationHistoryRepositoryFromEnv(
  env: MarketObservationHistoryEnvironment = processMarketObservationHistoryEnvironment(),
): MarketObservationHistoryRepository {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new MarketObservationHistoryUnavailableError(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for durable market observation history.',
    );
  }

  return new UpstashMarketObservationHistoryRepository(new Redis({ url, token }));
}
