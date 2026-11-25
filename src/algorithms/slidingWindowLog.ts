import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Redis as RedisClient } from 'ioredis';
import type { RateLimiter, RateLimitResult } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const luaScript = readFileSync(join(__dirname, 'lua', 'slidingWindowLog.lua'), 'utf-8');

/**
 * Sliding Window Log rate limiter.
 *
 * How it works: stores every request timestamp in a Redis sorted set.
 * On each check, entries older than the window are pruned, and the
 * remaining count is compared to the limit.
 *
 * Trade-off: perfectly accurate (no boundary burst), but memory usage
 * is O(n) where n = number of requests in the window. Use this for
 * low-volume, high-accuracy needs (e.g., login attempts).
 */
export class SlidingWindowLogLimiter implements RateLimiter {
  readonly algorithm = 'slidingWindowLog' as const;
  private redis: RedisClient;

  constructor(redis: RedisClient) {
    this.redis = redis;
    this.redis.defineCommand('slidingWindowLogCheck', {
      numberOfKeys: 1,
      lua: luaScript,
    });
  }

  async check(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    // Pass milliseconds for precision and unique member generation
    const nowMs = Date.now();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (this.redis as any).slidingWindowLogCheck(
      `rl:swl:${key}`,
      limit,
      windowSeconds,
      nowMs,
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
    await this.redis.del(`rl:swl:${key}`);
  }
}
