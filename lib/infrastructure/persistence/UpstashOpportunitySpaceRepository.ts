import { Redis } from '@upstash/redis';
import type { CandidateProfileId } from '../../domain';
import type {
  OpportunitySpaceHistory,
  OpportunitySpaceRepository,
} from '../../application/opportunity/OpportunitySpaceHistory';

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

export function createOpportunitySpaceRepositoryFromEnv(): OpportunitySpaceRepository {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for durable OpportunitySpace storage.');
  }
  return new UpstashOpportunitySpaceRepository(new Redis({ url, token }));
}
