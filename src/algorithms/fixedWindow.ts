import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Redis as RedisClient } from 'ioredis';
import type { RateLimiter, RateLimitResult } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const luaScript = readFileSync(
  join(__dirname, 'lua', 'fixedWindow.lua'),
  'utf-8',
);

/**
 * Fixed Window rate limiter.
 *
 * How it works: time is divided into fixed windows (e.g., every 60 s).
 * A counter per key per window is incremented on each request.
 * When the counter exceeds the limit, further requests are denied
 * until the next window starts.
 *
 * Trade-off: simple and fast, but has the "boundary burst" problem —
 * a client can send `limit` requests at the end of one window and
 * `limit` more at the start of the next, effectively doubling their
 * rate momentarily. The sliding window algorithms solve this.
 */
export class FixedWindowLimiter implements RateLimiter {
  readonly algorithm = 'fixedWindow' as const;
  private redis: RedisClient;

  constructor(redis: RedisClient) {
    this.redis = redis;

    // ioredis.defineCommand registers a custom command backed by a Lua script.
    // After this, this.redis.fixedWindowCheck(...) sends the script via EVALSHA
    // (falling back to EVAL on first call), which is efficient because Redis
    // caches the compiled script by its SHA hash.
    this.redis.defineCommand('fixedWindowCheck', {
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

    // TypeScript doesn't know about dynamically defined commands,
    // so we cast to access fixedWindowCheck. This is the only escape
    // hatch — ioredis defineCommand returns void, not a typed client.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (this.redis as any).fixedWindowCheck(
      `rl:fw:${key}`,
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
    // KEYS is used here (not SCAN) because reset is an admin operation,
    // not a hot path. In production with millions of keys, you'd use SCAN.
    const keys = await this.redis.keys(`rl:fw:${key}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
