import { Redis } from '@upstash/redis';
import {
  MarketOpportunityIndexUnavailableError,
  type MarketOpportunityIndexRepository,
  type MarketOpportunityIndexSnapshot,
} from '../../application/market/MarketOpportunityIndexHistory';

const KEY = 'ats2:market-opportunity-index:v1';

/**
 * First durable logical-opportunity index. This retains the current single-key
 * snapshot limitation and is not approved for provider-scale parallel writers.
 */
export class UpstashMarketOpportunityIndexRepository implements MarketOpportunityIndexRepository {
  constructor(private readonly redis: Redis) {}

  async load(): Promise<MarketOpportunityIndexSnapshot | null> {
    return await this.redis.get<MarketOpportunityIndexSnapshot>(KEY);
  }

  async save(snapshot: MarketOpportunityIndexSnapshot): Promise<void> {
    await this.redis.set(KEY, snapshot);
  }
}

export interface MarketOpportunityIndexEnvironment {
  readonly UPSTASH_REDIS_REST_URL?: string;
  readonly UPSTASH_REDIS_REST_TOKEN?: string;
}

function processEnvironment(): MarketOpportunityIndexEnvironment {
  return {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

export function createMarketOpportunityIndexRepositoryFromEnv(
  env: MarketOpportunityIndexEnvironment = processEnvironment(),
): MarketOpportunityIndexRepository {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new MarketOpportunityIndexUnavailableError(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for durable market opportunity identity.',
    );
  }
  return new UpstashMarketOpportunityIndexRepository(new Redis({ url, token }));
}
