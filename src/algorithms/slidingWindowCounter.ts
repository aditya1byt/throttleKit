import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Redis as RedisClient } from 'ioredis';
import type { RateLimiter, RateLimitResult } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const luaScript = readFileSync(
  join(__dirname, 'lua', 'slidingWindowCounter.lua'),
  'utf-8',
);

/**
 * Sliding Window Counter rate limiter.
 *
 * How it works: keeps counters for the current and previous fixed
 * windows. The effective count is a weighted sum:
 *
 *   weighted = prevCount × (1 − elapsed/window) + currentCount
 *
 * This approximates a true sliding window using O(1) memory (two
 * counters instead of storing every timestamp).
 *
 * Trade-off: not perfectly accurate — it assumes previous-window
 * requests were evenly distributed. In practice the error is small,
 * and this is what Cloudflare, Stripe, and most production systems use.
 */
export class SlidingWindowCounterLimiter implements RateLimiter {
  readonly algorithm = 'slidingWindowCounter' as const;
  private redis: RedisClient;

  constructor(redis: RedisClient) {
    this.redis = redis;
    this.redis.defineCommand('slidingWindowCounterCheck', {
      numberOfKeys: 1,
      lua: luaScript,
    });
  }

  async check(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const now = Math.floor(Date.now() / 1000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (this.redis as any).slidingWindowCounterCheck(
      `rl:swc:${key}`,
      limit,
      windowSeconds,
      now,
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
    const keys = await this.redis.keys(`rl:swc:${key}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
