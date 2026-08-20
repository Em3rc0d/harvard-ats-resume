import { Redis } from '@upstash/redis';
import type { CandidateProfileId } from '../../domain';
import type {
  CareerTargetPortfolio,
  CareerTargetRepository,
} from '../../application/target/CareerTargetPortfolio';
import {
  createDurableRedisFromEnv,
  processDurableRedisEnvironment,
  type DurableRedisEnvironment,
} from './DurableRedisRuntime';

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

export type CareerTargetEnvironment = DurableRedisEnvironment;

export function createCareerTargetRepository(redis: Redis): CareerTargetRepository {
  return new UpstashCareerTargetRepository(redis);
}

export function createCareerTargetRepositoryFromEnv(
  env: CareerTargetEnvironment = processDurableRedisEnvironment(),
): CareerTargetRepository {
  return createCareerTargetRepository(createDurableRedisFromEnv(env));
}
