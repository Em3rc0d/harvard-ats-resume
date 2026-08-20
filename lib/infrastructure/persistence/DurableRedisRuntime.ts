import { Redis } from '@upstash/redis';

export interface DurableRedisEnvironment {
  readonly UPSTASH_REDIS_REST_URL?: string;
  readonly UPSTASH_REDIS_REST_TOKEN?: string;
}

export type DurablePersistenceUnavailableReason =
  | 'CONFIGURATION_MISSING'
  | 'CONFIGURATION_INVALID'
  | 'BACKEND_UNAVAILABLE';

/**
 * Infrastructure-level failure for durable state dependencies.
 *
 * This error intentionally carries no credentials and is safe to classify in
 * server logs or API error metadata. Callers should never expose the underlying
 * Redis URL/token or raw network error to the browser.
 */
export class DurablePersistenceUnavailableError extends Error {
  constructor(
    readonly reason: DurablePersistenceUnavailableReason,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = 'DurablePersistenceUnavailableError';
  }
}

export interface DurableRedisRuntime {
  readonly redis: Redis;
  /**
   * Readiness is only a preflight gate. It never replaces domain-level
   * save -> reload -> integrity verification for a durability claim.
   */
  assertReady(): Promise<void>;
}

export function processDurableRedisEnvironment(): DurableRedisEnvironment {
  return {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

function validatedConfiguration(env: DurableRedisEnvironment): {
  readonly url: string;
  readonly token: string;
} {
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    throw new DurablePersistenceUnavailableError(
      'CONFIGURATION_MISSING',
      'Durable Redis persistence requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
    );
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Unsupported Redis REST protocol.');
    }
    if (!parsed.hostname) throw new Error('Redis REST hostname is missing.');
  } catch (cause) {
    throw new DurablePersistenceUnavailableError(
      'CONFIGURATION_INVALID',
      'Durable Redis persistence URL is not a valid HTTP(S) endpoint.',
      { cause },
    );
  }

  return { url, token };
}

export function createDurableRedisFromEnv(
  env: DurableRedisEnvironment = processDurableRedisEnvironment(),
): Redis {
  const { url, token } = validatedConfiguration(env);
  return new Redis({ url, token });
}

export function createDurableRedisRuntimeFromEnv(
  env: DurableRedisEnvironment = processDurableRedisEnvironment(),
): DurableRedisRuntime {
  const redis = createDurableRedisFromEnv(env);

  return {
    redis,
    async assertReady(): Promise<void> {
      try {
        const response = await redis.ping();
        if (response !== 'PONG') {
          throw new Error('Durable Redis readiness probe returned an unexpected response.');
        }
      } catch (cause) {
        if (cause instanceof DurablePersistenceUnavailableError) throw cause;
        throw new DurablePersistenceUnavailableError(
          'BACKEND_UNAVAILABLE',
          'Durable Redis persistence is configured but is not currently reachable or usable.',
          { cause },
        );
      }
    },
  };
}
