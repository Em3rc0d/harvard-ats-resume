import { Redis } from '@upstash/redis';
import type { CandidateProfileId } from '../../domain';
import type {
  CareerTargetPortfolio,
  CareerTargetRepository,
} from '../../application/target/CareerTargetPortfolio';

const KEY_PREFIX = 'ats2:career-targets:v1';

export class UpstashCareerTargetRepository implements CareerTargetRepository {
  constructor(private readonly redis: Redis) {}

  private key(candidateProfileId: CandidateProfileId): string {
    return `${KEY_PREFIX}:${candidateProfileId}`;
  }

  async load(candidateProfileId: CandidateProfileId): Promise<CareerTargetPortfolio | null> {
    return await this.redis.get<CareerTargetPortfolio>(this.key(candidateProfileId));
  }

  async save(portfolio: CareerTargetPortfolio): Promise<void> {
    await this.redis.set(this.key(portfolio.candidateProfileId), portfolio);
  }
}

export function createCareerTargetRepositoryFromEnv(): CareerTargetRepository {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for durable CareerTarget storage.');
  }
  return new UpstashCareerTargetRepository(new Redis({ url, token }));
}
