import { createHash } from 'node:crypto';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Simple in-memory rate limiter for development or fallback
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const rateLimitStore: RateLimitStore = {};

// Clean up old entries periodically (every 5 minutes). The housekeeping timer
// must never keep a server/test process alive on its own.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  Object.keys(rateLimitStore).forEach(key => {
    if (rateLimitStore[key].resetTime < now) {
      delete rateLimitStore[key];
    }
  });
}, 5 * 60 * 1000);
cleanupTimer.unref();

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export interface RateLimitEnvironment {
  readonly NODE_ENV?: string;
  readonly RATE_LIMIT_BACKEND?: string;
  readonly UPSTASH_REDIS_REST_URL?: string;
  readonly UPSTASH_REDIS_REST_TOKEN?: string;
}

export type RateLimitBackend = 'memory' | 'redis';

export const PUBLIC_API_RATE_LIMIT = 50;
export const PUBLIC_API_RATE_WINDOW_MS = 60 * 60 * 1000;

function processRateLimitEnvironment(): RateLimitEnvironment {
  return {
    NODE_ENV: process.env.NODE_ENV,
    RATE_LIMIT_BACKEND: process.env.RATE_LIMIT_BACKEND,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

/**
 * Rate limiting and Career Vault durability have different failure semantics.
 * Local development defaults to process memory so a stale remote Redis endpoint
 * cannot add DNS latency/noise to every field-test request. Production keeps
 * using Redis automatically when the server-side Upstash credentials exist.
 *
 * RATE_LIMIT_BACKEND can explicitly force `memory` or `redis`. Forcing Redis
 * without credentials still degrades to memory because rate limiting is not a
 * durability claim; Career Vault remains independently fail-closed.
 */
export function resolveRateLimitBackend(
  env: RateLimitEnvironment = processRateLimitEnvironment(),
): RateLimitBackend {
  const configured = env.RATE_LIMIT_BACKEND?.trim().toLowerCase();
  const hasRedisCredentials = Boolean(
    env.UPSTASH_REDIS_REST_URL?.trim() && env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );

  if (configured === 'memory') return 'memory';
  if (configured === 'redis') return hasRedisCredentials ? 'redis' : 'memory';

  if (env.NODE_ENV !== 'production') {
    return 'memory';
  }

  return hasRedisCredentials ? 'redis' : 'memory';
}

function createRateLimitRedis(env: RateLimitEnvironment): Redis | null {
  if (resolveRateLimitBackend(env) !== 'redis') return null;

  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;

  return new Redis({ url, token });
}

function redisFailureSummary(error: unknown): Record<string, string> {
  const summary: Record<string, string> = {
    message: error instanceof Error ? error.message : 'Unknown Redis error',
  };

  if (error instanceof Error && 'cause' in error) {
    const cause = error.cause;
    if (cause && typeof cause === 'object') {
      const code = 'code' in cause ? cause.code : undefined;
      const hostname = 'hostname' in cause ? cause.hostname : undefined;
      if (typeof code === 'string') summary.code = code;
      if (typeof hostname === 'string') summary.hostname = hostname;
    }
  }

  return summary;
}

function requestAddress(headers: Pick<Headers, 'get'>): string {
  const forwardedFor = headers.get('x-forwarded-for')
    ?.split(',')
    .map((value) => value.trim())
    .find(Boolean);
  const realIp = headers.get('x-real-ip')?.trim();
  return (forwardedFor || realIp || 'unknown').slice(0, 256);
}

/**
 * Produces an endpoint-scoped, non-reversible request identity. Raw client IPs
 * are not used as Redis/in-memory keys, and one endpoint cannot consume another
 * endpoint's quota simply because both originate from the same address.
 */
export function requestRateLimitIdentifier(
  headers: Pick<Headers, 'get'>,
  scope: string,
): string {
  const normalizedScope = scope.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9:_-]{1,80}$/.test(normalizedScope)) {
    throw new Error(`Invalid rate-limit scope: ${scope}`);
  }

  const digest = createHash('sha256')
    .update(`${normalizedScope}|${requestAddress(headers)}`, 'utf8')
    .digest('hex');
  return `request:${normalizedScope}:sha256:${digest.slice(0, 32)}`;
}

/**
 * Rate limit requests using Redis when selected, otherwise use in-memory.
 * Redis failures degrade to memory by design. This fallback must never be
 * confused with Career Vault persistence, which has no memory fallback.
 */
export async function rateLimit(
  identifier: string,
  limit: number = 5,
  windowMs: number = 60 * 60 * 1000, // 1 hour
): Promise<RateLimitResult> {
  const environment = processRateLimitEnvironment();
  const redis = createRateLimitRedis(environment);

  if (redis) {
    try {
      const duration = Math.max(1, Math.floor(windowMs / 1000)); // seconds

      const ratelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(limit, `${duration} s` as any),
        analytics: true,
        prefix: '@upstash/ratelimit',
      });

      const { success, limit: l, remaining, reset } = await ratelimit.limit(identifier);

      return {
        success,
        limit: l,
        remaining,
        reset,
      };
    } catch (error) {
      console.warn(
        'Redis rate limit unavailable; falling back to memory.',
        redisFailureSummary(error),
      );
    }
  }

  const now = Date.now();
  const key = `ratelimit:${identifier}`;

  if (!rateLimitStore[key] || rateLimitStore[key].resetTime < now) {
    rateLimitStore[key] = {
      count: 0,
      resetTime: now + windowMs,
    };
  }

  const record = rateLimitStore[key];
  record.count++;

  const success = record.count <= limit;
  const remaining = Math.max(0, limit - record.count);

  return {
    success,
    limit,
    remaining,
    reset: record.resetTime,
  };
}

export async function rateLimitPublicApiRequest(
  headers: Pick<Headers, 'get'>,
  scope: string,
): Promise<RateLimitResult> {
  return rateLimit(
    requestRateLimitIdentifier(headers, scope),
    PUBLIC_API_RATE_LIMIT,
    PUBLIC_API_RATE_WINDOW_MS,
  );
}

export function getRateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': new Date(result.reset).toISOString(),
  };
}
