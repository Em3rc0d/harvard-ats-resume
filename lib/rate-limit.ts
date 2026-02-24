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

// Clean up old entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  Object.keys(rateLimitStore).forEach(key => {
    if (rateLimitStore[key].resetTime < now) {
      delete rateLimitStore[key];
    }
  });
}, 5 * 60 * 1000);

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

// Check if Redis is configured
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
  : null;

/**
 * Rate limit requests using Redis if available, otherwise fallback to in-memory
 */
export async function rateLimit(
  identifier: string,
  limit: number = 5,
  windowMs: number = 60 * 60 * 1000 // 1 hour
): Promise<RateLimitResult> {


  // If Redis is configured, use Upstash Ratelimit
  if (redis) {
    try {
      // Create a new ratelimiter, that allows {limit} requests per {windowMs} duration
      const duration = Math.max(1, Math.floor(windowMs / 1000)); // seconds

      const ratelimit = new Ratelimit({
        redis: redis,
        limiter: Ratelimit.slidingWindow(limit, `${duration} s` as any),
        analytics: true,
        prefix: "@upstash/ratelimit",
      });

      const { success, limit: l, remaining, reset } = await ratelimit.limit(identifier);

      return {
        success,
        limit: l,
        remaining,
        reset,
      };
    } catch (error) {
      console.warn('Redis rate limit error, falling back to memory:', error);
      // Fallback to memory on error
    }
  }

  // In-memory fallback
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

export function getRateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': new Date(result.reset).toISOString(),
  };
}
