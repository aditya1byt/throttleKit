import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Redis as RedisClient } from 'ioredis';
import type { RateLimiter, RateLimitResult } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const luaScript = readFileSync(join(__dirname, 'lua', 'tokenBucket.lua'), 'utf-8');

/**
 * Token Bucket rate limiter.
 *
 * How it works: a bucket holds up to `limit` tokens. Each request
 * consumes one token. Tokens refill at a steady rate of
 * (limit / windowSeconds) per second. If the bucket is empty,
 * the request is denied.
 *
 * Trade-off vs fixed/sliding window:
 * - Allows short bursts up to `limit` (bucket can be full)
 * - Enforces a smooth long-term average rate
 * - Slightly more state (hash with two fields) vs a simple counter
 *
 * Best for: APIs where you want to allow occasional bursts but
 * cap the sustained rate (e.g., 100 req/min with burst up to 100).
 */
export class TokenBucketLimiter implements RateLimiter {
  readonly algorithm = 'tokenBucket' as const;
  private redis: RedisClient;

  constructor(redis: RedisClient) {
    this.redis = redis;
    this.redis.defineCommand('tokenBucketCheck', {
      numberOfKeys: 1,
      lua: luaScript,
    });
  }

  async check(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    // Fractional seconds for accurate refill calculation
    const now = Date.now() / 1000;
    const refillRate = limit / windowSeconds;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (this.redis as any).tokenBucketCheck(
      `rl:tb:${key}`,
      limit,
      refillRate,
      now,
      windowSeconds,
    );

    const [allowed, remaining, resetAt, retryAfterMs] = result as number[];

    return {
      allowed: allowed === 1,
      limit,
      remaining,
      resetAt,
      retryAfterMs,
    };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(`rl:tb:${key}`);
  }
}
