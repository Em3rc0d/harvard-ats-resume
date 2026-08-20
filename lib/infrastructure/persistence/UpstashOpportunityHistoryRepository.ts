import { Redis } from '@upstash/redis';
import type { CandidateProfileId } from '../../domain';
import {
  OpportunityHistoryUnavailableError,
  type OpportunityHistoryRepository,
  type OpportunityHistorySnapshot,
} from '../../application/opportunity/OpportunityHistory';
import {
  createDurableRedisFromEnv,
  DurablePersistenceUnavailableError,
  processDurableRedisEnvironment,
  type DurableRedisEnvironment,
} from './DurableRedisRuntime';

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

export type OpportunityHistoryEnvironment = DurableRedisEnvironment;

export function createOpportunityHistoryRepository(redis: Redis): OpportunityHistoryRepository {
  return new UpstashOpportunityHistoryRepository(redis);
}

export function createOpportunityHistoryRepositoryFromEnv(
  env: OpportunityHistoryEnvironment = processDurableRedisEnvironment(),
): OpportunityHistoryRepository {
  try {
    return createOpportunityHistoryRepository(createDurableRedisFromEnv(env));
  } catch (error) {
    if (error instanceof DurablePersistenceUnavailableError) {
      throw new OpportunityHistoryUnavailableError(
        'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for durable opportunity history.',
      );
    }
    throw error;
  }
}
