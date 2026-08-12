import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRateLimitBackend } from '../../lib/rate-limit';

test('local development defaults to memory rate limiting even when Career Vault Redis is configured', () => {
  assert.equal(resolveRateLimitBackend({
    NODE_ENV: 'development',
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test-token',
  }), 'memory');
});

test('local development can explicitly exercise Redis rate limiting', () => {
  assert.equal(resolveRateLimitBackend({
    NODE_ENV: 'development',
    RATE_LIMIT_BACKEND: 'redis',
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test-token',
  }), 'redis');
});

test('production automatically uses Redis rate limiting when credentials exist', () => {
  assert.equal(resolveRateLimitBackend({
    NODE_ENV: 'production',
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test-token',
  }), 'redis');
});

test('forcing Redis without credentials safely degrades rate limiting to memory only', () => {
  assert.equal(resolveRateLimitBackend({
    NODE_ENV: 'development',
    RATE_LIMIT_BACKEND: 'redis',
  }), 'memory');
});
