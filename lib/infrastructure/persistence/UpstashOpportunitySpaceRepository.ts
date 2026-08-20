import { Redis } from '@upstash/redis';
import type { CandidateProfileId } from '../../domain';
import type {
  OpportunitySpaceHistory,
  OpportunitySpaceRepository,
} from '../../application/opportunity/OpportunitySpaceHistory';
import {
  createDurableRedisFromEnv,
  processDurableRedisEnvironment,
  type DurableRedisEnvironment,
} from './DurableRedisRuntime';

const KEY_PREFIX = 'ats2:opportunity-spaces:v1';

export class UpstashOpportunitySpaceRepository implements OpportunitySpaceRepository {
  constructor(private readonly redis: Redis) {}

  private key(candidateProfileId: CandidateProfileId): string {
    return `${KEY_PREFIX}:${candidateProfileId}`;
  }

  async load(candidateProfileId: CandidateProfileId): Promise<OpportunitySpaceHistory | null> {
    return await this.redis.get<OpportunitySpaceHistory>(this.key(candidateProfileId));
  }

  async save(history: OpportunitySpaceHistory): Promise<void> {
    await this.redis.set(this.key(history.candidateProfileId), history);
  }
}

export type OpportunitySpaceEnvironment = DurableRedisEnvironment;

export function createOpportunitySpaceRepository(redis: Redis): OpportunitySpaceRepository {
  return new UpstashOpportunitySpaceRepository(redis);
}

export function createOpportunitySpaceRepositoryFromEnv(
  env: OpportunitySpaceEnvironment = processDurableRedisEnvironment(),
): OpportunitySpaceRepository {
  return createOpportunitySpaceRepository(createDurableRedisFromEnv(env));
}
