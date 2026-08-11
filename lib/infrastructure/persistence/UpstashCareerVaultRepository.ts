import { Redis } from '@upstash/redis';
import type { CandidateProfileId } from '../../domain';
import {
  CareerVaultUnavailableError,
  type CareerVaultRepository,
  type CareerVaultSnapshot,
} from '../../application/career-vault/CareerVaultRepository';

const KEY_PREFIX = 'ats2:career-vault:v1';

export class UpstashCareerVaultRepository implements CareerVaultRepository {
  constructor(private readonly redis: Redis) {}

  private key(candidateProfileId: CandidateProfileId): string {
    return `${KEY_PREFIX}:${candidateProfileId}`;
  }

  async load(candidateProfileId: CandidateProfileId): Promise<CareerVaultSnapshot | null> {
    return await this.redis.get<CareerVaultSnapshot>(this.key(candidateProfileId));
  }

  /**
   * The complete provenance graph is written under one Redis key. Redis SET is
   * atomic, so readers can observe either the previous complete snapshot or the
   * next complete snapshot, never a half-written ResumeVersion/Manifest graph.
   */
  async save(snapshot: CareerVaultSnapshot): Promise<void> {
    await this.redis.set(this.key(snapshot.candidate.id), snapshot);
  }
}

export interface CareerVaultEnvironment {
  readonly UPSTASH_REDIS_REST_URL?: string;
  readonly UPSTASH_REDIS_REST_TOKEN?: string;
}

function processCareerVaultEnvironment(): CareerVaultEnvironment {
  return {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

export function createCareerVaultRepositoryFromEnv(
  env: CareerVaultEnvironment = processCareerVaultEnvironment(),
): CareerVaultRepository {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new CareerVaultUnavailableError(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for durable Career Vault persistence.',
    );
  }

  return new UpstashCareerVaultRepository(new Redis({ url, token }));
}
