import { Redis } from '@upstash/redis';
import type { CandidateProfileId } from '../../domain';
import {
  OpportunityHistoryUnavailableError,
  type OpportunityHistoryRepository,
  type OpportunityHistorySnapshot,
} from '../../application/opportunity/OpportunityHistory';

const KEY_PREFIX = 'ats2:opportunity-history:v1';

export class UpstashOpportunityHistoryRepository implements OpportunityHistoryRepository {
  constructor(private readonly redis: Redis) {}

  private key(candidateProfileId: CandidateProfileId): string {
    return `${KEY_PREFIX}:${candidateProfileId}`;
  }

  async load(candidateProfileId: CandidateProfileId): Promise<OpportunityHistorySnapshot | null> {
    return await this.redis.get<OpportunityHistorySnapshot>(this.key(candidateProfileId));
  }

  async save(snapshot: OpportunityHistorySnapshot): Promise<void> {
    await this.redis.set(this.key(snapshot.candidateProfileId), snapshot);
  }
}

export interface OpportunityHistoryEnvironment {
  readonly UPSTASH_REDIS_REST_URL?: string;
  readonly UPSTASH_REDIS_REST_TOKEN?: string;
}

function processOpportunityHistoryEnvironment(): OpportunityHistoryEnvironment {
  return {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

export function createOpportunityHistoryRepositoryFromEnv(
  env: OpportunityHistoryEnvironment = processOpportunityHistoryEnvironment(),
): OpportunityHistoryRepository {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new OpportunityHistoryUnavailableError(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for durable opportunity history.',
    );
  }

  return new UpstashOpportunityHistoryRepository(new Redis({ url, token }));
}
